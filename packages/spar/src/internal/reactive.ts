import { Effect, Function, Predicate, Queue, Stream, SubscriptionRef } from "effect"
import type { Scope } from "effect"
import * as Cell from "./cell.ts"

export const TypeId = "~spar/Reactive"

export const Observe: unique symbol = Symbol.for("~spar/Reactive/observe")

export type Reactive<A> = {
  readonly [TypeId]: typeof TypeId
  readonly get: Effect.Effect<A>
  readonly changes: Stream.Stream<A>
  readonly [Observe]: (
    listener: Cell.Listener<A>,
    onError: (defect: unknown) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
}

export const make = <A>(get: Effect.Effect<A>, changes: Stream.Stream<A>): Reactive<A> => ({
  [TypeId]: TypeId,
  get,
  changes: Stream.changes(changes),
  [Observe]: (listener, onError) =>
    Effect.asVoid(
      Effect.forkScoped(
        Stream.runForEach(Stream.changes(changes), (value) =>
          Effect.sync(() => Cell.guarded(listener, onError)(value)),
        ),
        { startImmediately: true },
      ),
    ),
})

export const isReactive = (value: unknown): value is Reactive<unknown> =>
  Predicate.hasProperty(value, TypeId)

export const succeed = <A>(value: A): Reactive<A> => ({
  [TypeId]: TypeId,
  get: Effect.succeed(value),
  changes: Stream.empty,
  [Observe]: () => Effect.void,
})

export const fromCell = <A>(cell: Cell.Cell<A>): Reactive<A> => ({
  [TypeId]: TypeId,
  get: Effect.sync(cell.read),
  changes: Stream.callback<A>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        Queue.offerUnsafe(queue, cell.read())

        return cell.subscribe((value) => {
          Queue.offerUnsafe(queue, value)
        })
      }),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  ),
  [Observe]: (listener, onError) =>
    Effect.asVoid(
      Effect.acquireRelease(
        Effect.sync(() => cell.subscribe(Cell.guarded(listener, onError))),
        (unsubscribe) => Effect.sync(unsubscribe),
      ),
    ),
})

export const fromSubscriptionRef = <A>(ref: SubscriptionRef.SubscriptionRef<A>): Reactive<A> =>
  make(SubscriptionRef.get(ref), SubscriptionRef.changes(ref))

export const fromStream = Effect.fnUntraced(function* <A, R>(
  initial: A,
  stream: Stream.Stream<A, never, R>,
) {
  const current = Cell.make(initial)

  yield* Effect.forkScoped(
    Stream.runForEach(stream, (value) => Effect.sync(() => current.write(value))),
    { startImmediately: true },
  )

  return fromCell(current)
})

export const zip = Effect.fnUntraced(function* <A, B>(left: Reactive<A>, right: Reactive<B>) {
  const first = yield* left.get
  const second = yield* right.get
  const both = Cell.make<readonly [A, B]>([first, second])

  yield* left[Observe]((value) => both.write([value, both.read()[1]]), Function.constVoid)
  yield* right[Observe]((value) => both.write([both.read()[0], value]), Function.constVoid)

  return fromCell(both)
})

export const map: {
  <A, B>(f: (value: A) => B): (self: Reactive<A>) => Reactive<B>
  <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B>
} = Function.dual(2, <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B> => ({
  [TypeId]: TypeId,
  get: Effect.map(self.get, f),
  changes: Stream.changes(Stream.map(self.changes, f)),
  [Observe]: (listener, onError) =>
    Effect.suspend(() => self[Observe](Cell.mapped(f, listener), onError)),
}))
