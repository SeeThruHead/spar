import { Schema } from "effect"
import { Props, View } from "spar"

export const TallyView = View.make(
  "Tally",
  { label: Schema.String, count: Props.Reactive(Schema.Finite), onAdd: Props.Action },
  ({ label, count, onAdd }) => (
    <p>
      <output aria-label={`${label} count`}>{count}</output>
      <button type="button" onClick={onAdd}>
        Add to {label}
      </button>
    </p>
  ),
)

export const PairView = View.make(
  "Pair",
  { first: Props.Element, second: Props.Element },
  ({ first, second }) => (
    <section>
      {first}
      {second}
    </section>
  ),
)
