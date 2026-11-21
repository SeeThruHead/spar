import * as Domain from "@alchemy.run/domain"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { State } from "spar"
import * as Aggregates from "../src/index.ts"
import { Counter, CounterModel, FinishReset, Increment, Reset } from "./counter.ts"

const local = Layer.mergeAll(
  CounterModel.layer(Layer.empty).pipe(Layer.provide(Domain.InMemory)),
  State.layer,
)

const counting = Effect.gen(function* () {
  const counter = yield* Aggregates.store(Counter, "c-1")
  const before = yield* counter.state.get
  const receipt = yield* counter.send(new Increment({ counterId: "c-1" }))
  const after = yield* counter.state.get

  return { before, events: receipt.events.map((event) => event._tag), after }
})

describe("an aggregate as a store", () => {
  it.effect(
    "starts from the aggregate's state, and a command moves the slot in the one state",
    () =>
      Effect.gen(function* () {
        expect(yield* counting).toEqual({
          before: { count: 0, phase: "idle" },
          events: ["Incremented"],
          after: { count: 1, phase: "idle" },
        })

        const snapshot = yield* Effect.flatMap(State.current, (state) => state.snapshot)

        expect(snapshot).toContainEqual({
          path: [],
          name: "Counter/c-1",
          value: { count: 1, phase: "idle" },
        })
      }).pipe(Effect.provide(local), Effect.scoped),
  )

  it.effect(
    "a command the aggregate rejects fails with that typed rejection and changes nothing",
    () =>
      Effect.gen(function* () {
        const counter = yield* Aggregates.store(Counter, "c-2")

        yield* counter.send(new Increment({ counterId: "c-2" }))
        yield* counter.send(new Reset({ counterId: "c-2" }))

        const refused = yield* Effect.flip(counter.send(new Increment({ counterId: "c-2" })))

        expect(refused._tag).toBe("ResetInProgress")
        expect(yield* counter.state.get).toEqual({ count: 1, phase: "resetting" })

        yield* counter.send(new FinishReset({ counterId: "c-2" }))

        expect(yield* counter.state.get).toEqual({ count: 0, phase: "idle" })
      }).pipe(Effect.provide(local), Effect.scoped),
  )

  it("names a write after the command and lists its events by tag, skipping anything untagged", () => {
    expect(Aggregates.tagOf(new Increment({ counterId: "x" }))).toEqual(["Increment"])
    expect([null, 3, {}, { _tag: 4 }].flatMap(Aggregates.tagOf)).toEqual([])
  })
})
