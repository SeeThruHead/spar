import { Context, Effect, Fiber, Option, Queue, Stream, Tracer } from "effect"
import type { Scope } from "effect"
import { run, toAction } from "./action.ts"
import type { Action } from "./action.ts"
import { ActionScope } from "./actionScope.ts"
import { report } from "./crash.ts"
import * as Dom from "./dom.ts"
import { viewAt } from "./inspect.ts"

export type Source<E> = {
  readonly add: (listener: (event: E) => void) => void
  readonly remove: (listener: (event: E) => void) => void
}

export const on = (target: EventTarget, type: string): Source<Event> => ({
  add: (listener) => target.addEventListener(type, listener),
  remove: (listener) => target.removeEventListener(type, listener),
})

export const events = <E, A>(source: Source<E>, take: (event: E) => A): Stream.Stream<A> =>
  Stream.callback<A>((queue) => {
    const listener = (event: E): void => {
      Queue.offerUnsafe(queue, take(event))
    }

    return Effect.acquireRelease(
      Effect.sync(() => source.add(listener)),
      () => Effect.sync(() => source.remove(listener)),
    )
  })

const causing = (): Option.Option<Tracer.AnySpan> =>
  Option.flatMap(Option.fromUndefinedOr(Fiber.getCurrent()), (fiber) =>
    Context.getOption(fiber.context, Tracer.ParentSpan),
  )

const causedBy = (effect: Effect.Effect<void>, cause: Option.Option<Tracer.AnySpan>) =>
  Option.match(cause, {
    onNone: () => effect,
    onSome: (span) => Effect.withParentSpan(effect, span),
  })

const rootOf = (span: Tracer.AnySpan): Tracer.AnySpan =>
  span._tag === "Span" && Option.isSome(span.parent) ? rootOf(span.parent.value) : span

const eventOf = (span: Tracer.AnySpan): number => {
  if (span._tag !== "Span") return 0

  const event: unknown = span.attributes.get("spar.event")

  return typeof event === "number" ? event : 0
}

export const causedAt = (): number =>
  Option.match(causing(), { onNone: () => 0, onSome: (span) => eventOf(rootOf(span)) })

export const starterIn = Effect.fnUntraced(function* (scope: Scope.Scope) {
  const services = yield* Effect.context()
  const start = Effect.runForkWith(services)

  return (action: Action): void => {
    start(
      Effect.forkIn(Effect.catchDefect(causedBy(run(action), causing()), report), scope, {
        startImmediately: true,
      }),
    )
  }
})

export const starter = Effect.fnUntraced(function* () {
  const outliving = yield* ActionScope

  return yield* starterIn(outliving)
})

export const traced = (type: string, action: Action, target: unknown): Action => {
  if (Array.isArray(action) && action.length === 0) return action

  return Effect.withSpan(run(action), `on ${type}`, {
    captureStackTrace: false,
    root: true,
    attributes: {
      "spar.kind": "action",
      "spar.event": Dom.nextEvent(),
      ...Option.match(viewAt(target), {
        onNone: () => ({}),
        onSome: (view) => ({ "spar.view": view }),
      }),
    },
  })
}

export const listen = Effect.fnUntraced(function* (
  target: EventTarget,
  type: string,
  handler: unknown,
) {
  const start = yield* starter()
  const listener = (event: Event): void =>
    start(traced(type, toAction(handler, event), event.currentTarget))

  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener)),
    () => Effect.sync(() => target.removeEventListener(type, listener)),
  )
})
