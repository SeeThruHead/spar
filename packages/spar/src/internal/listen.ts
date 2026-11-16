import { Effect, Queue, Stream } from "effect"
import type { Cause } from "effect"
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

export const listen = Effect.fnUntraced(function* (
  target: EventTarget,
  type: string,
  handler: unknown,
) {
  const outliving = yield* ActionScope
  const pending = yield* Queue.unbounded<Action, Cause.Done>()
  const listener = (event: Event): void => {
    Queue.offerUnsafe(pending, toAction(handler, event))
  }

  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener)),
    () =>
      Effect.andThen(
        Effect.sync(() => target.removeEventListener(type, listener)),
        Queue.end(pending),
      ),
  )
  yield* Effect.forkIn(
    Stream.runForEach(Stream.fromQueue(pending), (action) =>
      Effect.catchDefect(run(action), report),
    ),
    outliving,
    { startImmediately: true },
  )
})
