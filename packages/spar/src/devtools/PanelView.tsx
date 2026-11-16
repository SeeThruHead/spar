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
  readonly exported: Reactive.Reactive<string>
  readonly pasted: Reactive.Reactive<string>
  readonly problem: Reactive.Reactive<string>
  readonly onBack: Action
  readonly onForward: Action
  readonly onLive: Action
  readonly onExport: Action
  readonly onPaste: (event: { readonly currentTarget: { readonly value: string } }) => Action
  readonly onLoad: Action
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
    <button onClick={props.onExport}>Export log</button>
    <textarea aria-label={`${props.name} exported log`} readOnly={true} value={props.exported} />
    <textarea
      aria-label={`${props.name} log to load`}
      value={props.pasted}
      onInput={props.onPaste}
    />
    <button onClick={props.onLoad}>Load log</button>
    <output aria-label={`${props.name} problem`}>{props.problem}</output>
  </section>
)

type DeadProps = {
  readonly summary: Reactive.Reactive<string>
  readonly onRetry: Action
  readonly onDiscard: Action
}

export const DeadView = ({ summary, onRetry, onDiscard }: DeadProps) => (
  <li>
    <code>{summary}</code>
    <button onClick={onRetry}>Retry</button>
    <button onClick={onDiscard}>Discard</button>
  </li>
)

type OutboxProps = {
  readonly pending: Reactive.Reactive<number>
  readonly dead: Element
}

export const OutboxView = ({ pending, dead }: OutboxProps) => (
  <section aria-label="Outbox">
    <h2>Outbox</h2>
    <p>
      Waiting to send: <output aria-label="Outbox waiting">{pending}</output>
    </p>
    <ul aria-label="Not sent">{dead}</ul>
  </section>
)

type PanelProps = {
  readonly stores: Element
  readonly outbox: ReadonlyArray<Element>
}

export const PanelView = ({ stores, outbox }: PanelProps) => (
  <aside aria-label="Developer tools">
    <h2>Stores</h2>
    {stores}
    {outbox}
  </aside>
)
