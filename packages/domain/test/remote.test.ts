import * as Domain from "@alchemy.run/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { State } from "spar"
import * as Aggregates from "../src/index.ts"
import { Counter, CounterApi, CounterModel, Increment, Reset } from "./counter.ts"

const served = Layer.mergeAll(
  CounterApi.layerClientInProcess.pipe(
    Layer.provide(CounterModel.layer(Layer.empty).pipe(Layer.provide(Domain.InMemory))),
  ),
  State.layer,
  SecureRandom.layerWebCrypto,
)

const counterOver = Effect.gen(function* () {
  const api = yield* CounterApi.Client

  return { aggregate: Counter, view: api.CounterView, commands: api }
})

describe("an aggregate behind an Api as a store", () => {
  it.effect("sends each command through the Api and reads the state back from the view", () =>
    Effect.gen(function* () {
      const over = yield* counterOver
      const counter = yield* Aggregates.remote(over, "r-1")

      expect(yield* counter.state.get).toEqual({ count: 0, phase: "idle" })

      yield* counter.send(new Increment({ counterId: "r-1" }))
      yield* counter.send(new Increment({ counterId: "r-1" }))

      expect(yield* counter.state.get).toEqual({ count: 2, phase: "idle" })

      yield* counter.send(new Reset({ counterId: "r-1" }))

      const refused = yield* Effect.flip(counter.send(new Increment({ counterId: "r-1" })))

      expect(refused._tag).toBe("ResetInProgress")
      expect(yield* counter.state.get).toEqual({ count: 2, phase: "resetting" })
    }).pipe(Effect.provide(served), Effect.scoped),
  )
})
