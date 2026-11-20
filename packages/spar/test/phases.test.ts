import { describe, expect, it } from "@effect/vitest"
import { Context, Duration, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle" }

class Counter extends Store.Tag<Counter>()("test/PhasedCounter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      phase: "resetting",
    })),
    resetCompleted: Store.action(Schema.Void, (_state: State): State => initialState),
  },
  selectors: {
    count: Store.selector(Schema.Int, (state: State) => state.count),
    phase: Store.selector(State.fields.phase, (state: State) => state.phase),
  },
  phases: {
    of: (state) => state.phase,
    accepts: {
      idle: ["incremented", "resetClicked"],
      resetting: ["resetCompleted"],
    },
    internal: ["resetCompleted"],
  },
}) {}

const resets = Store.during("resetting", (_state: State, send) =>
  Effect.andThen(
    Effect.sleep(Duration.seconds(2)),
    send(Counter.actions.resetCompleted, undefined),
  ),
)

const opened = (from: State = initialState) =>
  Effect.map(Layer.build(Counter.layerFrom(Effect.succeed(from), [resets])), (built) =>
    Context.get(built, Counter),
  )

const refusal = (counter: typeof Counter.Service) =>
  Effect.map(counter.refused.get, (refused) =>
    Option.match(refused, {
      onNone: () => "nothing refused",
      onSome: (told) => `${told.action}: ${told.reason}`,
    }),
  )

describe("a store whose commands are declared for each state", () => {
  it.effect("refuses what the state does not list, with no guard written on any action", () =>
    Effect.gen(function* () {
      const counter = yield* opened()

      yield* counter.commands.incremented()
      yield* counter.commands.resetClicked()
      yield* counter.commands.incremented()
      expect(yield* refusal(counter)).toBe("incremented: it is not accepted while resetting")

      yield* counter.commands.resetClicked()
      expect(yield* refusal(counter)).toBe("resetClicked: it is not accepted while resetting")
      expect(yield* counter.select.count.get).toBe(1)
    }),
  )

  it.effect("refuses an internal command from outside, in every state", () =>
    Effect.gen(function* () {
      const counter = yield* opened()

      yield* counter.commands.incremented()
      yield* counter.commands.resetCompleted()
      expect(yield* refusal(counter)).toBe(
        "resetCompleted: it is internal to the store: only the store's own effects may send it",
      )

      yield* counter.commands.resetClicked()
      yield* counter.commands.resetCompleted()
      expect([yield* counter.select.phase.get, yield* counter.select.count.get]).toEqual([
        "resetting",
        1,
      ])
    }),
  )

  it.effect("runs the state's effect once, which ends the state from inside", () =>
    Effect.gen(function* () {
      const counter = yield* opened()

      yield* counter.commands.incremented()
      yield* counter.commands.resetClicked()
      yield* counter.commands.resetClicked()
      yield* TestClock.adjust(Duration.seconds(1))
      expect(yield* counter.select.phase.get).toBe("resetting")

      yield* TestClock.adjust(Duration.seconds(1))
      expect([yield* counter.select.phase.get, yield* counter.select.count.get]).toEqual([
        "idle",
        0,
      ])
      expect((yield* counter.log.get).map((entry) => entry.action)).toEqual([
        "incremented",
        "resetClicked",
        "resetCompleted",
      ])
    }),
  )

  it.effect("starts the state's effect when the store opens already in that state", () =>
    Effect.gen(function* () {
      const counter = yield* opened({ count: 4, phase: "resetting" })

      yield* TestClock.adjust(Duration.seconds(2))
      expect([yield* counter.select.phase.get, yield* counter.select.count.get]).toEqual([
        "idle",
        0,
      ])
    }),
  )
})
