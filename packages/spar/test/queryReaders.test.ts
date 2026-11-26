import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Predicate, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Query, State } from "spar"

const Refused = Schema.Struct({ reason: Schema.String })

type Refused = typeof Refused.Type

class Answer extends Context.Service<Answer, Ref.Ref<number | null>>()("test/queryReaders/Answer") {
  static readonly layer = Layer.effect(Answer, Ref.make<number | null>(4))
}

class Count extends Query.Tag<Count>()("test/queryReaders/Count", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Refused,
  staleAfter: "0 millis",
  load: () =>
    Effect.flatMap(Answer, (answer) =>
      Effect.filterOrFail(
        Effect.andThen(Effect.sleep("1 second"), Ref.get(answer)),
        Predicate.isNotNull,
        (): Refused => ({ reason: "closed" }),
      ),
    ),
}) {}

class Total extends Query.Tag<Total>()("test/queryReaders/Total", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.Never,
  load: () => Effect.as(Effect.sleep("1 second"), 12),
}) {}

const layer = Layer.mergeAll(Count.live, Total.live).pipe(
  Layer.provideMerge(Answer.layer),
  Layer.provideMerge(SecureRandom.layerWebCrypto),
  Layer.provideMerge(State.layer),
)

const told = (handle: Query.Handle<number, Refused>) =>
  Query.shown(handle, {
    loading: "loading",
    failed: (error) => `refused: ${error.reason}`,
    loaded: (count) => `${count} left`,
  })

describe("reading a query", () => {
  it.effect("valueOf reads a query that cannot fail", () =>
    Effect.gen(function* () {
      const total = Query.valueOf(yield* Total.ask())

      expect(yield* total.get).toBeNull()
      yield* TestClock.adjust("1 second")
      expect(yield* total.get).toBe(12)
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )

  it.effect("shown says what to draw while loading, once loaded, and once failed", () =>
    Effect.gen(function* () {
      const answer = yield* Answer
      const count = yield* Count.ask()
      const line = told(count)

      expect(yield* line.get).toBe("loading")
      yield* TestClock.adjust("1 second")
      expect(yield* line.get).toBe("4 left")

      yield* Ref.set(answer, null)
      yield* count.refetch
      yield* TestClock.adjust("1 second")
      expect(yield* line.get).toBe("refused: closed")
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )

  it.effect("valueOr puts a value in place of a failure", () =>
    Effect.gen(function* () {
      const answer = yield* Answer
      const count = yield* Count.ask()
      const shownCount = Query.valueOr(count, () => 0)

      expect(yield* shownCount.get).toBeNull()
      yield* TestClock.adjust("1 second")
      expect(yield* shownCount.get).toBe(4)

      yield* Ref.set(answer, null)
      yield* count.refetch
      yield* TestClock.adjust("1 second")
      expect(yield* shownCount.get).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
})
