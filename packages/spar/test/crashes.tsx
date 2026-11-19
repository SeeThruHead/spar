import { Schema } from "effect"
import { Props, Reactive, View } from "spar"
import { Item } from "./views.tsx"

export const BrokenPartView = View.make(
  "BrokenPartView",
  { defect: Schema.Unknown },
  ({ defect }) => <p role="alert">This part is unavailable: {String(defect)}</p>,
)

export const WidgetView = View.make("WidgetView", { title: Schema.String }, ({ title }) => (
  <h2>{title}</h2>
))

export const PageView = View.make(
  "PageView",
  {
    widget: Props.Element,
    label: Props.Reactive(Schema.String),
    reports: Props.Reactive(Schema.Finite),
    onBreak: Props.Action,
    onRename: Props.Action,
  },
  ({ widget, label, reports, onBreak, onRename }) => (
    <main>
      {widget}
      <button onClick={onBreak}>Break</button>
      <button onClick={onRename}>Rename</button>
      <output aria-label="Label">{label}</output>
      <output aria-label="Reports">{reports}</output>
    </main>
  ),
)

const shownLabel = (item: Item): string => {
  if (item.label === "Beta") throw new TypeError("Beta cannot be shown")

  return item.label
}

export const FussyItemView = View.make(
  "FussyItemView",
  { item: Props.Reactive(Item) },
  ({ item }) => <li>{Reactive.map(item, shownLabel)}</li>,
)
