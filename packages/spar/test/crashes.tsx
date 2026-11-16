import { Reactive } from "spar"
import type { Action, Element } from "spar"
import type { Item } from "./views.tsx"

export const BrokenPartView = ({ defect }: { readonly defect: unknown }) => (
  <p role="alert">This part is unavailable: {String(defect)}</p>
)

export const WidgetView = ({ title }: { readonly title: string }) => <h2>{title}</h2>

type PageProps = {
  readonly widget: Element
  readonly label: Reactive.Reactive<string>
  readonly reports: Reactive.Reactive<number>
  readonly onBreak: Action
  readonly onRename: Action
}

export const PageView = ({ widget, label, reports, onBreak, onRename }: PageProps) => (
  <main>
    {widget}
    <button onClick={onBreak}>Break</button>
    <button onClick={onRename}>Rename</button>
    <output aria-label="Label">{label}</output>
    <output aria-label="Reports">{reports}</output>
  </main>
)

const shownLabel = (item: Item): string => {
  if (item.label === "Beta") throw new TypeError("Beta cannot be shown")

  return item.label
}

export const FussyItemView = ({ item }: { readonly item: Reactive.Reactive<Item> }) => (
  <li>{Reactive.map(item, shownLabel)}</li>
)
