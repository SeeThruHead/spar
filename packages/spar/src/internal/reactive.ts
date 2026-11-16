import { Effect, Function, Predicate, Stream, SubscriptionRef } from "effect"

export const TypeId = "~spar/Reactive"

export type Reactive<A> = {
  readonly [TypeId]: typeof TypeId
  readonly get: Effect.Effect<A>
  readonly changes: Stream.Stream<A>
}

export const make = <A>(get: Effect.Effect<A>, changes: Stream.Stream<A>): Reactive<A> => ({
  [TypeId]: TypeId,
  get,
  changes: Stream.changes(changes),
})

export const isReactive = (value: unknown): value is Reactive<unknown> =>
  Predicate.hasProperty(value, TypeId)

export const succeed = <A>(value: A): Reactive<A> => make(Effect.succeed(value), Stream.empty)

export const fromSubscriptionRef = <A>(ref: SubscriptionRef.SubscriptionRef<A>): Reactive<A> =>
  make(SubscriptionRef.get(ref), SubscriptionRef.changes(ref))

export const fromStream = Effect.fnUntraced(function* <A, R>(
  initial: A,
  stream: Stream.Stream<A, never, R>,
) {
  const current = yield* SubscriptionRef.make(initial)

  yield* Effect.forkScoped(
    Stream.runForEach(stream, (value) => SubscriptionRef.set(current, value)),
    { startImmediately: true },
  )

  return fromSubscriptionRef(current)
})

export const map: {
  <A, B>(f: (value: A) => B): (self: Reactive<A>) => Reactive<B>
  <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B>
} = Function.dual(2, <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B> =>
  make(Effect.map(self.get, f), Stream.map(self.changes, f)),
)
