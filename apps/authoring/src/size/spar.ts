import { Effect, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle" }

class Counter extends Store.Tag<Counter>()("size/Counter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
  },
  selectors: {},
}) {}

const program = Effect.gen(function* () {
  const counter = yield* Counter

  return yield* counter.commands.incremented()
})

Effect.runFork(Effect.provide(program, Counter.layer()))
