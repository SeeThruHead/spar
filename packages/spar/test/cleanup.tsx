import { Schema } from "effect"
import { Props, Reactive, View } from "spar"

export const Item = Schema.Struct({ id: Schema.String, label: Schema.String })

export type Item = typeof Item.Type

export const RowView = View.make(
  "RowView",
  {
    item: Props.Reactive(Item),
    shared: Props.Reactive(Schema.String),
    marked: Props.Reactive(Schema.Boolean),
    onPick: Props.Action,
  },
  ({ item, shared, marked, onPick }) => (
    <li class={{ marked }}>
      <span>{Reactive.map(item, (current) => current.label)}</span>
      <em>{shared}</em>
      <button type="button" onClick={onPick}>
        Pick
      </button>
    </li>
  ),
)

export const ListView = View.make(
  "ListView",
  {
    rows: Props.Element,
    shared: Props.Reactive(Schema.String),
    picks: Props.Reactive(Schema.Finite),
    onMark: Props.Action,
  },
  ({ rows, shared, picks, onMark }) => (
    <section aria-label="Things">
      <p aria-label="Shared">{shared}</p>
      <output aria-label="Picks">{picks}</output>
      <button type="button" onClick={onMark}>
        Mark
      </button>
      <ul>{rows}</ul>
    </section>
  ),
)
