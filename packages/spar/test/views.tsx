import { Schema } from "effect"
import { Props, Reactive, UiState, View } from "spar"

export const Item = Schema.Struct({ id: Schema.String, label: Schema.String })

export type Item = typeof Item.Type

export const ItemView = View.make("ItemView", { item: Props.Reactive(Item) }, ({ item }) => (
  <li>{Reactive.map(item, (current) => current.label)}</li>
))

export const BoardView = View.make(
  "BoardView",
  { total: Props.Reactive(Schema.Finite), rows: Props.Element, onAdd: Props.Action },
  ({ total, rows, onAdd }) => (
    <section aria-label="Board">
      <output aria-label="Total">{total}</output>
      <button onClick={onAdd}>Add item</button>
      <ul aria-label="Items">{rows}</ul>
    </section>
  ),
)

export const DetailsView = View.make("DetailsView", { note: Schema.String }, ({ note }) => (
  <p role="note">{note}</p>
))

export const DisclosureView = View.make(
  "DisclosureView",
  { open: Props.State(Schema.Boolean), details: Props.Element },
  ({ open, details }) => (
    <section aria-label="Disclosure">
      <button onClick={UiState.update(open, (shown) => !shown)}>Toggle details</button>
      {details}
    </section>
  ),
)

export const LoadingView = View.make("LoadingView", { id: Schema.String }, ({ id }) => (
  <p role="status">Loading {id}</p>
))

export const LoadedView = View.make("LoadedView", { title: Schema.String }, ({ title }) => (
  <h2>{title}</h2>
))

const Failure = Schema.TaggedStruct("LoadFailed", { message: Schema.String })

export const FailedView = View.make("FailedView", { error: Failure }, ({ error }) => (
  <p role="alert">{error.message}</p>
))
