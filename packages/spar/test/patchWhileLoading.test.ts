import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Query, State } from "spar"
import { statusIn, valueIn } from "./results.ts"

class Server extends Context.Service<Server, Ref.Ref<number>>()("test/patchWhileLoading/Server") {
  static readonly layer = Layer.effect(Server, Ref.make(3))
}

class Stock extends Query.Tag<Stock>()("test/patchWhileLoading/Stock", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.Never,
  staleAfter: "1 minute",
  load: () =>
    Effect.flatMap(Server, (server) => Effect.tap(Ref.get(server), () => Effect.sleep("1 second"))),
}) {}

const layer = Stock.live.pipe(
  Layer.provideMerge(Server.layer),
  Layer.provideMerge(SecureRandom.layerWebCrypto),
  Layer.provideMerge(State.layer),
)

describe("a change shown while the query reloads", () => {
  it.effect("is kept when the answer read before it arrives, and the next load confirms it", () =>
    Effect.gen(function* () {
      const server = yield* Server
      const stock = yield* Stock.ask()

      yield* TestClock.adjust("1 second")
      expect(valueIn(yield* stock.result.get)).toBe(3)

      yield* stock.refetch
      yield* Stock.patch(undefined, () => 10)
      yield* Ref.set(server, 10)
      expect(valueIn(yield* stock.result.get)).toBe(10)

      yield* TestClock.adjust("1 second")
      expect(valueIn(yield* stock.result.get)).toBe(10)
      expect(statusIn(yield* stock.result.get)).toBe("loaded")

      yield* Ref.set(server, 11)
      yield* Stock.ask()
      yield* TestClock.adjust("1 second")
      expect(valueIn(yield* stock.result.get)).toBe(11)
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
})
