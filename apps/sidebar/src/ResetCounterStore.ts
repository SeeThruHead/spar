import { Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Finite,
  resetting: Schema.Boolean,
  resetDuration: Schema.Finite,
})

type State = typeof State.Type

const initialState: State = { count: 0, resetting: false, resetDuration: 2 }

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
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      resetting: true,
    })),
    resetCompleted: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: 0,
      resetting: false,
    })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.resetting),
    resetDuration: Store.selector(Schema.Finite, (state: State) => state.resetDuration),
  },
}) {}
