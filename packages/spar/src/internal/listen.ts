import { Effect, Queue, Stream } from "effect"
import type { Scope } from "effect"
import { run, toAction } from "./action.ts"

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

export const listen = (
  target: EventTarget,
  type: string,
  handler: unknown,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.forkScoped(
    Stream.runForEach(
      events(on(target, type), (event) => toAction(handler, event)),
      run,
    ),
    { startImmediately: true },
  ).pipe(Effect.asVoid)
