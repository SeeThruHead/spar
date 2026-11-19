import { Schema } from "effect"
import { Props, View } from "spar"

export const ResetCounterView = View.make(
  "ResetCounterView",
  {
    count: Props.Reactive(Schema.Finite),
    status: Props.Reactive(Schema.String),
    resetDuration: Props.Reactive(Schema.String),
    refused: Props.Reactive(Schema.String),
    onIncrement: Props.Action,
    onReset: Props.Action,
    onDuration: Props.Callback(Schema.Finite),
  },
  (props) => (
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
          value={props.resetDuration}
          onInput={(event) => props.onDuration(Number(event.currentTarget.value))}
        />
      </label>
      <p>
        <output aria-label="Last refusal">{props.refused}</output>
      </p>
      <p class="hint">Both buttons stay enabled, and the + key adds 1 too. The store decides.</p>
    </section>
  ),
)
