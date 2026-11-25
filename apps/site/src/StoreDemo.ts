import { Effect, Schema } from "effect"
import { Reactive, Store, compose, withStore } from "spar"
import { StoreDemoView } from "./StoreDemoView.tsx"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

export class CounterStore extends Store.Tag<CounterStore>()("site/Counter", {
  state: State,
  initialState: { count: 0 },
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({ count: state.count + 1 })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
  },
  tasks: {
    reset: Store.task(Schema.Void, {
      result: Schema.Void,
      run: () => Effect.sleep("2 seconds"),
      finish: (): State => ({ count: 0 }),
      mode: "switch",
      refuses: ["incremented", "reset"],
    }),
  },
}) {}

const Panel = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.running.reset, (resetting) =>
      resetting ? "resetting" : "counting",
    ),
    onIncrement: store.commands.incremented(),
    onReset: store.tasks.reset(),
  })),
)(StoreDemoView)

export const StoreDemo = CounterStore.with(Panel)
