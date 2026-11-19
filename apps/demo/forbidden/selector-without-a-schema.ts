import { Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

export class Plain extends Store.Tag<Plain>()("forbidden/Plain", {
  state: State,
  initialState,
  actions: {
    reset: Store.action(Schema.Void, (): State => initialState),
  },
  selectors: {
    count: (state: State) => state.count,
  },
}) {}
