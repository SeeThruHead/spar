import * as Domain from "@alchemy.run/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Ref, Stream } from "effect"
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

const at = (count: number) => ({ count, phase: "idle" as const })

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

  it.live("a store that follows the view sees what another client sent, and each state once", () =>
    Effect.gen(function* () {
      const over = yield* counterOver
      const mine = yield* Aggregates.remote(over, "r-3")
      const theirs = yield* Aggregates.remote(over, "r-3")
      const reached = (count: number) =>
        Stream.runHead(Stream.filter(mine.state.changes, (now) => now.count === count))
      const seen = yield* Effect.forkScoped(Stream.runCollect(Stream.take(mine.state.changes, 3)))

      yield* Effect.forkScoped(mine.follow)
      yield* theirs.send(new Increment({ counterId: "r-3" }))
      yield* Effect.timeout(reached(1), "2 seconds")
      yield* mine.send(new Increment({ counterId: "r-3" }))

      expect(yield* Effect.timeout(Fiber.join(seen), "2 seconds")).toEqual([
        { count: 0, phase: "idle" },
        { count: 1, phase: "idle" },
        { count: 2, phase: "idle" },
      ])
    }).pipe(Effect.provide(served), Effect.scoped),
  )

  it.effect("a snapshot older than what the store wrote, or no different, writes nothing", () =>
    Effect.gen(function* () {
      const counter = yield* Aggregates.remote(
        {
          aggregate: Counter,
          view: {
            get: (_key: string, options?: { readonly atLeast?: ReadonlyArray<unknown> }) =>
              Effect.succeed(options?.atLeast?.length === 1 ? at(2) : at(0)),
            watch: () =>
              Stream.make(
                { state: at(1), cursor: 1 },
                { state: null, cursor: 0 },
                { state: at(2), cursor: 2 },
                { state: at(2), cursor: 3 },
              ),
          },
          commands: {
            Increment: () => Effect.succeed({ stream: "Counter/f", version: 2 }),
            Reset: () => Effect.succeed({ stream: "Counter/f", version: 3 }),
            FinishReset: () => Effect.succeed({ stream: "Counter/f", version: 4 }),
          },
        },
        "f",
      )

      const seen = yield* Ref.make<ReadonlyArray<number>>([])

      yield* Effect.forkScoped(
        Stream.runForEach(counter.state.changes, (now) =>
          Ref.update(seen, (all) => [...all, now.count]),
        ),
      )
      yield* Effect.yieldNow
      yield* counter.send(new Increment({ counterId: "f" }))
      yield* counter.follow
      yield* Effect.yieldNow

      expect(yield* counter.state.get).toEqual(at(2))
      expect(yield* Ref.get(seen)).toEqual([0, 2])
    }).pipe(Effect.provide([State.layer, SecureRandom.layerWebCrypto]), Effect.scoped),
  )
})
