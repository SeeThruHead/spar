import { Effect, FiberHandle, Schema } from "effect"
import { Reactive, Store, compose, withStore } from "spar"
import { StoreDemoView } from "./StoreDemoView.tsx"

const State = Schema.Struct({
  count: Schema.Finite,
  resetting: Schema.Boolean,
})

type State = typeof State.Type

export class CounterStore extends Store.Tag<CounterStore>()("site/Counter", {
  state: State,
  initialState: { count: 0, resetting: false },
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      resetting: true,
    })),
    resetCompleted: Store.action(Schema.Void, (): State => ({ count: 0, resetting: false })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.resetting),
  },
}) {}

const withReset = Effect.fnUntraced(function* () {
  const store = yield* CounterStore
  const running = yield* FiberHandle.make()
  const reset = Effect.gen(function* () {
    yield* store.commands.resetClicked()
    yield* Effect.sleep("2 seconds")
    yield* store.commands.resetCompleted()
  })

  return { onReset: Effect.asVoid(FiberHandle.run(running, reset, { onlyIfMissing: true })) }
})

const Panel = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.select.resetting, (resetting) =>
      resetting ? "resetting" : "counting",
    ),
    onIncrement: store.commands.incremented(),
  })),
  withReset,
)(StoreDemoView)

export const StoreDemo = CounterStore.with(Panel)
