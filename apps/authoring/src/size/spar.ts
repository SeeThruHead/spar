import { Effect, Layer, Schema } from "effect"
import { State, Store } from "spar"

const CounterState = Schema.Struct({ count: Schema.Int })

type CounterState = typeof CounterState.Type

class Counter extends Store.Tag<Counter>()("size/Counter", {
  state: CounterState,
  initialState: { count: 0 },
  actions: {
    incremented: Store.action(Schema.Void, (state: CounterState): CounterState => ({
      count: state.count + 1,
    })),
  },
  selectors: {},
}) {}

const program = Effect.gen(function* () {
  const counter = yield* Counter

  return yield* counter.commands.incremented()
})

Effect.runFork(Effect.provide(program, Counter.layer.pipe(Layer.provide(State.layer))))
