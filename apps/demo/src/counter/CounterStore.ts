import { Schema } from "effect"
import { Model, Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

export class CounterStore extends Model.Tag<CounterStore>()("demo/counter/CounterStore", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
    reset: Store.action(Schema.Void, (): State => initialState),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    doubled: Store.selector(Schema.Finite, (state: State) => state.count * 2),
  },
}) {}
