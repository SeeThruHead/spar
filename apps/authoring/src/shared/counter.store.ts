import { Duration, Effect, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle" }

export class CounterStore extends Store.Tag<CounterStore>()("Counter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      phase: "resetting",
    })),
    resetCompleted: Store.action(Schema.Void, (_state: State): State => initialState),
  },
  selectors: {
    count: Store.selector(Schema.Int, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.phase === "resetting"),
  },
  invariants: {
    CountIsNeverNegative: (state) => state.count >= 0,
  },
  transitions: {
    NothingChangesDuringAReset: ({ before, after, action }) =>
      before.phase !== "resetting" || action === "resetCompleted" || after === before,
  },
}) {}

export const resetAfterDelay = Store.after(
  CounterStore.actions.resetClicked,
  (_payload, _state, send) =>
    Effect.andThen(
      Effect.sleep(Duration.seconds(2)),
      send(CounterStore.actions.resetCompleted, undefined),
    ),
)
