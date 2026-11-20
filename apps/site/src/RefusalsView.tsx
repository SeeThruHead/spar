import { Schema } from "effect"
import { Props, View } from "spar"

export const RefusalsView = View.make(
  "RefusalsView",
  {
    count: Props.Reactive(Schema.Finite),
    status: Props.Reactive(Schema.String),
    refused: Props.Reactive(Schema.String),
    onIncrement: Props.Action,
    onReset: Props.Action,
  },
  (props) => (
    <section class="demo" aria-label="Live example: a store that refuses">
      <p class="demo-label">Live example</p>
      <p class="demo-count">
        <output aria-label="Count">{props.count}</output>
        <output class="demo-status" aria-label="Counter status">
          {props.status}
        </output>
      </p>
      <p>
        <button type="button" class="spar-button spar-primary" onClick={props.onIncrement}>
          Add 1
        </button>{" "}
        <button type="button" class="spar-button" onClick={props.onReset}>
          Reset after two seconds
        </button>
      </p>
      <p>
        <output aria-label="Last refusal">{props.refused}</output>
      </p>
      <p class="hint">
        Neither button is ever disabled. Press Reset, then Add 1: the store refuses it and says why.
      </p>
    </section>
  ),
)
