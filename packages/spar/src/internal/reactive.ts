import { Effect, Function, Predicate, Queue, Stream, SubscriptionRef } from "effect"
import type { Scope } from "effect"
import * as Cell from "./cell.ts"

export const TypeId = "~spar/Reactive"

export const Observe: unique symbol = Symbol.for("~spar/Reactive/observe")

export const Backing: unique symbol = Symbol.for("~spar/Reactive/backing")

export type Reactive<A> = {
  readonly [TypeId]: typeof TypeId
  readonly get: Effect.Effect<A>
  readonly changes: Stream.Stream<A>
  readonly [Observe]: (
    listener: Cell.Listener<A>,
    onError: (defect: unknown) => void,
  ) => Effect.Effect<Cell.Stop>
}

export type Backed<A> = Reactive<A> & { readonly [Backing]: Cell.Cell<A> }

export const make = <A>(get: Effect.Effect<A>, changes: Stream.Stream<A>): Reactive<A> => ({
  [TypeId]: TypeId,
  get,
  changes: Stream.changes(changes),
  [Observe]: (listener, onError) =>
    Effect.map(
      Effect.forkDetach(
        Stream.runForEach(Stream.changes(changes), (value) =>
          Effect.sync(() => Cell.guarded(listener, onError)(value)),
        ),
        { startImmediately: true },
      ),
      (fiber) => () => fiber.interruptUnsafe(),
    ),
})

export const isReactive = (value: unknown): value is Reactive<unknown> =>
  Predicate.hasProperty(value, TypeId)

export const succeed = <A>(value: A): Reactive<A> => ({
  [TypeId]: TypeId,
  get: Effect.succeed(value),
  changes: Stream.empty,
  [Observe]: () => Effect.succeed(Function.constVoid),
})

class FromCell<A> implements Backed<A> {
  readonly [TypeId] = TypeId
  readonly [Backing]: Cell.Cell<A>

  constructor(cell: Cell.Cell<A>) {
    this[Backing] = cell
  }

  get get(): Effect.Effect<A> {
    return Effect.sync(() => this[Backing].read())
  }

  get changes(): Stream.Stream<A> {
    const cell = this[Backing]

    return Stream.callback<A>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          Queue.offerUnsafe(queue, cell.read())

          return cell.subscribe((value) => {
            Queue.offerUnsafe(queue, value)
          })
        }),
        (stop) => Effect.sync(stop),
      ),
    )
  }

  [Observe](
    listener: Cell.Listener<A>,
    onError: (defect: unknown) => void,
  ): Effect.Effect<Cell.Stop> {
    return Effect.sync(() => this[Backing].subscribe(Cell.guarded(listener, onError)))
  }
}

export const fromCell = <A>(cell: Cell.Cell<A>): Backed<A> => new FromCell(cell)

class Mapped<A, B> implements Reactive<B> {
  readonly [TypeId] = TypeId
  readonly self: Reactive<A>
  readonly f: (value: A) => B

  constructor(self: Reactive<A>, f: (value: A) => B) {
    this.self = self
    this.f = f
  }

  get get(): Effect.Effect<B> {
    return Effect.map(this.self.get, this.f)
  }

  get changes(): Stream.Stream<B> {
    return Stream.changes(Stream.map(this.self.changes, this.f))
  }

  [Observe](
    listener: Cell.Listener<B>,
    onError: (defect: unknown) => void,
  ): Effect.Effect<Cell.Stop> {
    return this.self[Observe](Cell.mapped(this.f, listener), onError)
  }
}

export const map: {
  <A, B>(f: (value: A) => B): (self: Reactive<A>) => Reactive<B>
  <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B>
} = Function.dual(
  2,
  <A, B>(self: Reactive<A>, f: (value: A) => B): Reactive<B> => new Mapped(self, f),
)

export const observed = <A>(
  source: Reactive<A>,
  listener: Cell.Listener<A>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(
    Effect.acquireRelease(source[Observe](listener, Function.constVoid), (stop) =>
      Effect.sync(stop),
    ),
  )

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

  yield* observed(left, (value) => both.write([value, both.read()[1]]))
  yield* observed(right, (value) => both.write([both.read()[0], value]))

  return fromCell(both)
})
