import type { Action, Element, Reactive } from "../index.ts"

type EntryProps = {
  readonly seq: string
  readonly summary: Reactive.Reactive<string>
  readonly current: Reactive.Reactive<boolean>
  readonly onGoTo: Action
}

export const EntryView = ({ seq, summary, current, onGoTo }: EntryProps) => (
  <li aria-current={current}>
    <button onClick={onGoTo}>Go to {seq}</button>
    <code>{summary}</code>
  </li>
)

type StoreProps = {
  readonly name: string
  readonly position: Reactive.Reactive<string>
  readonly state: Reactive.Reactive<string>
  readonly entries: Element
  readonly onBack: Action
  readonly onForward: Action
  readonly onLive: Action
}

export const StoreView = (props: StoreProps) => (
  <section aria-label={props.name}>
    <h3>{props.name}</h3>
    <p>
      Showing: <output aria-label={`${props.name} position`}>{props.position}</output>
    </p>
    <button onClick={props.onBack}>Back</button>
    <button onClick={props.onForward}>Forward</button>
    <button onClick={props.onLive}>Live</button>
    <ol aria-label={`${props.name} actions`}>{props.entries}</ol>
    <pre aria-label={`${props.name} state`}>{props.state}</pre>
  </section>
)

export const PanelView = ({ stores }: { readonly stores: Element }) => (
  <aside aria-label="Developer tools">
    <h2>Stores</h2>
    {stores}
  </aside>
)
