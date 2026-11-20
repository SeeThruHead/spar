import { Effect, Schema } from "effect"
import { Reactive, UiState, compose, withKey, withStore } from "spar"
import { ResetCounterStore, resetAfterDelay, told } from "./ResetCounterStore.ts"

const withDelay = Effect.fnUntraced(function* () {
  const store = yield* ResetCounterStore
  const saved = yield* store.select.resetDuration.get
  const delay = yield* UiState.make("delay", Schema.String, String(saved))

  return {
    delay,
    onDelay: (typed: string) => [
      UiState.set(delay, typed),
      store.commands.resetDurationChanged(Number(typed)),
    ],
  }
})

const ResetCounterPanel = compose(
  withStore(ResetCounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.select.resetting, (resetting) =>
      resetting ? "Resetting" : "Counting",
    ),
    refused: Reactive.map(store.refused, told),
    onIncrement: store.commands.incremented(),
    onReset: store.commands.resetClicked(),
  })),
  withDelay,
  withKey("+", (props) => props.onIncrement),
)((props) => (
  <section class="reset-counter" aria-label="Counter">
    <h2>Counter</h2>
    <p>
      <output aria-label="Count">{props.count}</output>{" "}
      <output aria-label="Counter status">{props.status}</output>
    </p>
    <p>
      <button type="button" class="spar-button" onClick={props.onIncrement}>
        Add 1
      </button>{" "}
      <button type="button" class="spar-button spar-quiet" onClick={props.onReset}>
        Reset after a delay
      </button>
    </p>
    <label>
      Delay in seconds{" "}
      <input
        type="number"
        min="0"
        value={props.delay}
        onInput={(event) => props.onDelay(event.currentTarget.value)}
      />
    </label>
    <p>
      <output aria-label="Last refusal">{props.refused}</output>
    </p>
    <p class="hint">Both buttons stay enabled, and the + key adds 1 too. The store decides.</p>
  </section>
))

export const ResetCounter = ResetCounterStore.with(ResetCounterPanel, [resetAfterDelay])
