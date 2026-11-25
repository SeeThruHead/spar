import { Duration, Effect, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Finite,
  resetDuration: Schema.Finite,
})

type State = typeof State.Type

const initialState: State = { count: 0, resetDuration: 2 }

export class ResetCounterStore extends Store.Tag<ResetCounterStore>()("sidebar/ResetCounter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    resetDurationChanged: Store.action(Schema.Finite, (state: State, seconds: number): State => ({
      ...state,
      resetDuration: Math.max(0, seconds),
    })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    resetDuration: Store.selector(Schema.Finite, (state: State) => state.resetDuration),
  },
  tasks: {
    reset: Store.task(Schema.Void, {
      result: Schema.Void,
      run: (_: void, state: State) => Effect.sleep(Duration.seconds(state.resetDuration)),
      finish: (state: State): State => ({ ...state, count: 0 }),
      mode: "switch",
      refuses: ["incremented", "reset"],
    }),
  },
}) {}
