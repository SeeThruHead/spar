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

export const OrdersView = View.make(
  "Orders",
  { status: Props.Reactive(Schema.String), count: Props.Reactive(Schema.Finite) },
  ({ status, count }) => (
    <p>
      <output aria-label="Orders status">{status}</output>
      <output aria-label="Orders count">{count}</output>
    </p>
  ),
)

export const ShelfView = View.make("Shelf", { orders: Props.Element }, ({ orders }) => (
  <section>{orders}</section>
))

export const MarkView = View.make(
  "Mark",
  { marked: Props.Reactive(Schema.Boolean), rows: Props.Element },
  ({ marked, rows }) => (
    <section>
      <p aria-label="mark" class={{ on: marked }}>
        mark
      </p>
      <ul>{rows}</ul>
    </section>
  ),
)

export const LineView = View.make("Line", { text: Props.Reactive(Schema.String) }, ({ text }) => (
  <li>{text}</li>
))
