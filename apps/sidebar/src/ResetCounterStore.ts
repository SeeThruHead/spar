import { Duration, Effect, Option, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({
  count: Schema.Finite,
  phase: Schema.Literals(["idle", "resetting"]),
  resetDuration: Schema.Finite,
})

type State = typeof State.Type

const initialState: State = { count: 0, phase: "idle", resetDuration: 2 }

const whileResetting =
  (reason: string) =>
  (state: State): string | null =>
    state.phase === "resetting" ? reason : null

export class ResetCounterStore extends Store.Tag<ResetCounterStore>()("sidebar/ResetCounter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, count: state.count + 1 }),
      whileResetting("A reset is in progress"),
    ),
    resetDurationChanged: Store.action(
      Schema.Finite,
      (state: State, seconds: number): State => ({ ...state, resetDuration: Math.max(0, seconds) }),
      whileResetting("The delay cannot change during a reset"),
    ),
    resetClicked: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, phase: "resetting" }),
      whileResetting("A reset is already in progress"),
    ),
    resetCompleted: Store.action(
      Schema.Void,
      (state: State): State => ({ ...state, count: 0, phase: "idle" }),
      (state) => (state.phase === "idle" ? "No reset is in progress" : null),
    ),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.phase === "resetting"),
    resetDuration: Store.selector(Schema.Finite, (state: State) => state.resetDuration),
  },
}) {}

export const resetAfterDelay = Store.after(
  ResetCounterStore.actions.resetClicked,
  (_payload, state: State, send) =>
    Effect.andThen(
      Effect.sleep(Duration.seconds(state.resetDuration)),
      send(ResetCounterStore.actions.resetCompleted, undefined),
    ),
)

export const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, {
    onNone: () => "Nothing has been refused",
    onSome: (refusal) => `${refusal.action} was not accepted: ${refusal.reason}`,
  })
