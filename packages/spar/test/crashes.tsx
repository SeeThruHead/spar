import type { Action, Element, Reactive } from "spar"

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
