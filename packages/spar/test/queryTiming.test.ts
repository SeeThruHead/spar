import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Ref, Schema, SubscriptionRef } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Query, Reactive, State } from "spar"
import { valueIn } from "./results.ts"

class Loads extends Context.Service<Loads, Ref.Ref<ReadonlyArray<string>>>()("test/timing/Loads") {
  static readonly layer = Layer.effect(Loads, Ref.make<ReadonlyArray<string>>([]))
}

const loaded = (what: string) =>
  Effect.flatMap(Loads, (loads) =>
    Effect.as(
      Ref.update(loads, (all) => [...all, what]),
      what,
    ),
  )

class Ticks extends Query.Tag<Ticks>()("test/timing/Ticks", {
  input: Schema.Void,
  success: Schema.String,
  failure: Schema.Never,
  staleAfter: "1 minute",
  refetchEvery: "1 second",
  load: () => loaded("tick"),
}) {}

class Search extends Query.Tag<Search>()("test/timing/Search", {
  input: Schema.String,
  success: Schema.String,
  failure: Schema.Never,
  debounce: "300 millis",
  load: (text: string) => loaded(`found ${text}`),
}) {}

const layer = Layer.mergeAll(Ticks.live, Search.live).pipe(
  Layer.provideMerge(Loads.layer),
  Layer.provideMerge(SecureRandom.layerWebCrypto),
  Layer.provideMerge(State.layer),
)

const loadCount = Effect.map(Effect.flatMap(Loads, Ref.get), (all) => all.length)

const pageShown = (state: "visible" | "hidden") =>
  Effect.sync(() => {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })

describe("a query on a timer", () => {
  it.effect("polls each key once however many ask, and stops when the last one leaves", () =>
    Effect.gen(function* () {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const ticks = yield* Ticks.ask()

          yield* Ticks.ask()
          expect(yield* loadCount).toBe(1)

          yield* TestClock.adjust("1 second")
          expect(yield* loadCount).toBe(2)

          yield* TestClock.adjust("2 seconds")
          expect(yield* loadCount).toBe(4)
          expect(valueIn(yield* ticks.result.get)).toBe("tick")
        }),
      )

      yield* TestClock.adjust("5 seconds")
      expect(yield* loadCount).toBe(4)
    }).pipe(Effect.provide(layer)),
  )

  it.effect("skips a poll while the page is hidden", () =>
    Effect.gen(function* () {
      yield* Ticks.ask()
      yield* pageShown("hidden")
      yield* TestClock.adjust("3 seconds")
      expect(yield* loadCount).toBe(1)

      yield* pageShown("visible")
      yield* TestClock.adjust("1 second")
      expect(yield* loadCount).toBe(2)
    }).pipe(Effect.ensuring(pageShown("visible")), Effect.scoped, Effect.provide(layer)),
  )
})

describe("a debounced query", () => {
  it.effect("asks for the first input at once, then only for what was left after a pause", () =>
    Effect.gen(function* () {
      const typed = yield* SubscriptionRef.make("a")
      const search = yield* Search.ask(Reactive.fromSubscriptionRef(typed))

      yield* SubscriptionRef.set(typed, "ad")
      yield* TestClock.adjust("100 millis")
      yield* SubscriptionRef.set(typed, "ada")
      yield* TestClock.adjust("299 millis")
      expect(yield* Effect.flatMap(Loads, Ref.get)).toEqual(["found a"])
      expect(valueIn(yield* search.result.get)).toBe("found a")

      yield* TestClock.adjust("1 millis")
      expect(yield* Effect.flatMap(Loads, Ref.get)).toEqual(["found a", "found ada"])
      expect(valueIn(yield* search.result.get)).toBe("found ada")
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
})
