import { Effect, Option, Schema } from "effect"
import { Reactive, Store, compose, withStore } from "spar"
import { RefusalsView } from "./RefusalsView.tsx"

const State = Schema.Struct({
  count: Schema.Finite,
  phase: Schema.Literals(["counting", "resetting"]),
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "counting" }

const whileResetting =
  (reason: string) =>
  (state: State): string | null =>
    state.phase === "resetting" ? reason : null

export class CounterStore extends Store.Tag<CounterStore>()("site/Counter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, count: state.count + 1 }),
      whileResetting("a reset is in progress"),
    ),
    resetClicked: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, phase: "resetting" }),
      whileResetting("a reset is already in progress"),
    ),
    resetCompleted: Store.action(Schema.Void, (_state: State): State => ({
      count: 0,
      phase: "counting",
    })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.phase === "resetting"),
  },
}) {}

const resetAfterDelay = Store.after(CounterStore.actions.resetClicked, (_payload, _state, send) =>
  Effect.andThen(Effect.sleep("2 seconds"), send(CounterStore.actions.resetCompleted, undefined)),
)

const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, {
    onNone: () => "Nothing has been refused yet",
    onSome: (refusal) => `${refusal.action} was refused: ${refusal.reason}`,
  })

const Panel = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.select.resetting, (resetting) =>
      resetting ? "resetting" : "counting",
    ),
    refused: Reactive.map(store.refused, told),
    onIncrement: store.commands.incremented(),
    onReset: store.commands.resetClicked(),
  })),
)(RefusalsView)

export const Refusals = CounterStore.with(Panel, [resetAfterDelay])
