import { Schema } from "effect"
import { Store } from "spar"

type State = { readonly count: number }

const initialState: State = { count: 0 }

export class CounterStore extends Store.Tag<CounterStore>()("demo/counter/CounterStore", {
  initialState,
  actions: {
    incremented: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
    reset: Store.action(Schema.Void, (): State => initialState),
  },
  selectors: {
    count: (state) => state.count,
    doubled: (state) => state.count * 2,
  },
}) {}
