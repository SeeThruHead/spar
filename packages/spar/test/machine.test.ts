import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Layer, Option, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Store, Timeline } from "spar"

const State = Schema.Struct({
  count: Schema.Finite,
  phase: Schema.Literals(["idle", "resetting"]),
  resetDuration: Schema.Finite,
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle", resetDuration: 2 }

class Counter extends Store.Tag<Counter>()("test/Counter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(
      Schema.Void,
      (state: State) => ({ ...state, count: state.count + 1 }),
      (state) => (state.phase === "resetting" ? "A reset is in progress" : null),
    ),
    resetClicked: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, phase: "resetting" }),
      (state) => (state.phase === "resetting" ? "A reset is already in progress" : null),
    ),
    resetCompleted: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, count: 0, phase: "idle" }),
      (state) => (state.phase === "idle" ? "No reset is in progress" : null),
    ),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    phase: Store.selector(State.fields.phase, (state: State) => state.phase),
  },
}) {}

const reset = Store.after(Counter.actions.resetClicked, (_payload, state: State, send) =>
  Effect.andThen(
    Effect.sleep(Duration.seconds(state.resetDuration)),
    send(Counter.actions.resetCompleted, undefined),
  ),
)

const counting = (noted: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Layer.provide(
    Counter.layer([reset]),
    Layer.mergeAll(
      SecureRandom.layerWebCrypto,
      Layer.succeed(
        Timeline.Recorder,
        Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
      ),
    ),
  )

const started = Effect.gen(function* () {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(counting(noted))

  return { counter: yield* Effect.provide(Effect.service(Counter), built), noted }
})

describe("a store that is a state machine", () => {
  it.effect("Add 1 sent during a reset is refused, whoever sends it, and the reset lands", () =>
    Effect.gen(function* () {
      const { counter, noted } = yield* started

      yield* counter.commands.incremented()
      yield* counter.commands.incremented()
      yield* counter.commands.resetClicked()
      yield* TestClock.adjust("1 second")
      yield* counter.commands.incremented()

      expect(yield* counter.state.get).toEqual({ count: 2, phase: "resetting", resetDuration: 2 })
      expect(yield* counter.refused.get).toEqual(
        Option.some({
          action: "incremented",
          reason: "A reset is in progress",
          payload: null,
        }),
      )

      yield* TestClock.adjust("1 second")

      expect(yield* counter.state.get).toEqual({ count: 0, phase: "idle", resetDuration: 2 })
      expect((yield* counter.log.get).map((entry) => entry.action)).toEqual([
        "incremented",
        "incremented",
        "resetClicked",
        "resetCompleted",
      ])
      expect((yield* Ref.get(noted)).map((seen) => [seen.kind, seen.name, seen.detail])).toEqual([
        ["command", "test/Counter/incremented", null],
        ["command", "test/Counter/incremented", null],
        ["command", "test/Counter/resetClicked", null],
        [
          "refused",
          "test/Counter/incremented",
          { payload: null, reason: "A reset is in progress" },
        ],
        ["command", "test/Counter/resetCompleted", null],
      ])

      expect(Option.isNone(yield* counter.refused.get)).toBe(true)
      yield* counter.commands.incremented()
      expect(yield* counter.select.count.get).toBe(1)
    }),
  )

  it.effect("a second reset during a reset is refused, so only one lands", () =>
    Effect.gen(function* () {
      const { counter } = yield* started

      yield* counter.commands.resetClicked()
      yield* counter.commands.resetClicked()
      yield* TestClock.adjust("2 seconds")
      yield* counter.commands.incremented()
      yield* TestClock.adjust("2 seconds")

      expect(yield* counter.state.get).toEqual({ count: 1, phase: "idle", resetDuration: 2 })
      expect((yield* counter.log.get).map((entry) => entry.action)).toEqual([
        "resetClicked",
        "resetCompleted",
        "incremented",
      ])
    }),
  )

  it.effect("a refused command is not in the log, so a replay gives the same state", () =>
    Effect.gen(function* () {
      const { counter } = yield* started

      yield* counter.commands.incremented()
      yield* counter.commands.resetCompleted()

      const log = yield* counter.log.get

      expect(log.map((entry) => entry.action)).toEqual(["incremented"])
      expect(yield* Store.replay(Counter.definition, log)).toEqual(yield* counter.state.get)
      expect(
        yield* Store.replay(Counter.definition, [
          ...log,
          { id: "x", action: "resetCompleted", payload: null, seq: 2 },
        ]),
      ).toEqual(yield* counter.state.get)
    }),
  )
})
