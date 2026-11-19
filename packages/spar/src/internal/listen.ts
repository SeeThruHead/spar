import { Effect, Queue, Stream } from "effect"
import type { Scope } from "effect"
import { run, toAction } from "./action.ts"
import type { Action } from "./action.ts"
import { ActionScope } from "./actionScope.ts"
import { report } from "./crash.ts"

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

export const starterIn = Effect.fnUntraced(function* (scope: Scope.Scope) {
  const services = yield* Effect.context()
  const start = Effect.runForkWith(services)

  return (action: Action): void => {
    start(
      Effect.forkIn(Effect.catchDefect(run(action), report), scope, {
        startImmediately: true,
      }),
    )
  }
})

export const starter = Effect.fnUntraced(function* () {
  const outliving = yield* ActionScope

  return yield* starterIn(outliving)
})

export const traced = (type: string, action: Action): Action => {
  if (Array.isArray(action) && action.length === 0) return action

  return Effect.withSpan(run(action), `on ${type}`, { captureStackTrace: false })
}

export const listen = Effect.fnUntraced(function* (
  target: EventTarget,
  type: string,
  handler: unknown,
) {
  const start = yield* starter()
  const listener = (event: Event): void => start(traced(type, toAction(handler, event)))

  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener)),
    () => Effect.sync(() => target.removeEventListener(type, listener)),
  )
})
