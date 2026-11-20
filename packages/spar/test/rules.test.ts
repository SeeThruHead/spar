import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle" }

class Counter extends Store.Tag<Counter>()("test/RuledCounter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    taken: Store.action(Schema.Int, (state: State, by: number): State => ({
      ...state,
      count: state.count - by,
    })),
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      phase: "resetting",
    })),
    resetCompleted: Store.action(Schema.Void, (_state: State): State => initialState),
  },
  selectors: { count: Store.selector(Schema.Int, (state: State) => state.count) },
  invariants: {
    CountIsNeverNegative: (state) => state.count >= 0,
  },
  transitions: {
    NothingCountsDuringAReset: ({ before, after, action }) =>
      before.phase !== "resetting" || action === "resetCompleted" || after.count === before.count,
  },
}) {}

const opened = Effect.map(Layer.build(Counter.layer()), (built) => Context.get(built, Counter))

const refusal = (counter: typeof Counter.Service) =>
  Effect.map(counter.refused.get, (refused) =>
    Option.match(refused, {
      onNone: () => "nothing refused",
      onSome: (told) => `${told.action}: ${told.reason}`,
    }),
  )

describe("rules declared once on a store", () => {
  it.effect(
    "a command that would leave a state no rule allows is refused, by the rule's name",
    () =>
      Effect.gen(function* () {
        const counter = yield* opened

        yield* counter.commands.incremented()
        yield* counter.commands.taken(5)
        expect(yield* counter.select.count.get).toBe(1)
        expect(yield* refusal(counter)).toBe("taken: it would break the rule CountIsNeverNegative")

        yield* counter.commands.taken(1)
        expect(yield* counter.select.count.get).toBe(0)
        expect(yield* refusal(counter)).toBe("nothing refused")
      }),
  )

  it.effect("a command that takes a step no rule allows is refused, whatever sent it", () =>
    Effect.gen(function* () {
      const counter = yield* opened

      yield* counter.commands.incremented()
      yield* counter.commands.resetClicked()
      yield* counter.commands.incremented()
      expect(yield* counter.select.count.get).toBe(1)
      expect(yield* refusal(counter)).toBe(
        "incremented: it would break the rule NothingCountsDuringAReset",
      )

      yield* counter.commands.resetCompleted()
      yield* counter.commands.incremented()
      expect(yield* counter.select.count.get).toBe(1)
      expect((yield* counter.log.get).map((entry) => entry.action)).toEqual([
        "incremented",
        "resetClicked",
        "resetCompleted",
        "incremented",
      ])
    }),
  )
})
