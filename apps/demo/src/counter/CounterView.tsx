import { Schema } from "effect"
import { Props, View } from "spar"

export const CounterView = View.make(
  "CounterView",
  {
    count: Props.Reactive(Schema.Finite),
    doubled: Props.Reactive(Schema.Finite),
    onIncrement: Props.Action,
    onReset: Props.Action,
  },
  ({ count, doubled, onIncrement, onReset }) => (
    <section aria-label="Counter">
      <h2>Counter</h2>
      <p>
        Count <output aria-label="Count">{count}</output>, doubled{" "}
        <output aria-label="Doubled">{doubled}</output>
      </p>
      <button onClick={onIncrement}>Add one</button>
      <button onClick={onReset}>Reset</button>
    </section>
  ),
)
