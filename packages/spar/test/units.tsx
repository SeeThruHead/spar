import { Schema } from "effect"
import { Props, Router, View } from "spar"

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

export const FeedView = View.make(
  "Feed",
  {
    items: Props.Reactive(Schema.String),
    state: Props.Reactive(Schema.String),
    more: Props.Reactive(Schema.String),
    onMore: Props.Action,
  },
  ({ items, state, more, onMore }) => (
    <p>
      <output aria-label="Feed items">{items}</output>
      <output aria-label="Feed state">{state}</output>
      <output aria-label="Feed more">{more}</output>
      <button type="button" onClick={onMore}>
        More
      </button>
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

export const DoorView = View.make("Door", { orders: Router.Link }, ({ orders }) => (
  <main>
    <h1>Home</h1>
    <a
      href={orders.href}
      onClick={orders.onClick}
      onPointerenter={orders.onIntent}
      onFocus={orders.onIntent}
    >
      Orders of 7
    </a>
  </main>
))

export const HallView = View.make("Hall", { page: Props.Element }, ({ page }) => <div>{page}</div>)
