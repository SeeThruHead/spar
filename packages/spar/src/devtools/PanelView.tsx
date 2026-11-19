import { Schema } from "effect"
import * as Props from "../Props.ts"
import * as Reactive from "../Reactive.ts"
import * as UiState from "../UiState.ts"
import * as View from "../View.ts"

export const MomentView = View.make(
  "MomentView",
  {
    seq: Schema.String,
    summary: Props.Reactive(Schema.String),
    trace: Props.Reactive(Schema.String),
    current: Props.Reactive(Schema.Boolean),
    onJump: Props.Action,
  },
  ({ seq, summary, trace, current, onJump }) => (
    <li aria-current={current}>
      <button onClick={onJump}>Jump to {seq}</button>
      <code>{summary}</code> <small aria-label={`Trace of ${seq}`}>{trace}</small>
    </li>
  ),
)

export const TimelineView = View.make(
  "TimelineView",
  {
    position: Props.Reactive(Schema.String),
    moments: Props.Element,
    onBack: Props.Action,
    onForward: Props.Action,
    onLive: Props.Action,
  },
  ({ position, moments, onBack, onForward, onLive }) => (
    <section aria-label="Everything that happened">
      <h2>Everything that happened</h2>
      <p>
        <output aria-label="Timeline position">{position}</output>{" "}
        <button onClick={onBack}>Earlier</button> <button onClick={onForward}>Later</button>{" "}
        <button onClick={onLive}>Back to now</button>
      </p>
      <ol>{moments}</ol>
    </section>
  ),
)

const dock = {
  position: "fixed",
  right: "12px",
  bottom: "12px",
  zIndex: "2147483000",
  display: "flex",
  flexDirection: "column-reverse",
  alignItems: "flex-end",
  gap: "8px",
  maxWidth: "min(620px, calc(100vw - 24px))",
  font: "13px/1.45 system-ui, sans-serif",
  color: "#141a22",
}

const toggle = {
  font: "inherit",
  padding: "6px 12px",
  borderRadius: "999px",
  border: "1px solid #1f3a8a",
  background: "#1d4ed8",
  color: "#ffffff",
  cursor: "pointer",
}

const sheet = {
  boxSizing: "border-box",
  width: "100%",
  maxHeight: "min(70vh, 640px)",
  overflow: "auto",
  padding: "4px 16px 16px",
  borderRadius: "10px",
  border: "1px solid #c5cbd6",
  background: "#ffffff",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
}

export const ToolsView = View.make(
  "ToolsView",
  { open: Props.State(Schema.Boolean), timeline: Props.Element, stores: Props.Element },
  ({ open, timeline, stores }) => (
    <aside aria-label="Spar devtools" data-spar-devtools="" style={dock}>
      <button aria-expanded={open} style={toggle} onClick={UiState.update(open, (shown) => !shown)}>
        Devtools
      </button>
      <div hidden={Reactive.map(open, (shown) => !shown)} style={sheet}>
        {timeline}
        {stores}
      </div>
    </aside>
  ),
)

export const EntryView = View.make(
  "EntryView",
  {
    seq: Schema.String,
    summary: Props.Reactive(Schema.String),
    current: Props.Reactive(Schema.Boolean),
    onGoTo: Props.Action,
  },
  ({ seq, summary, current, onGoTo }) => (
    <li aria-current={current}>
      <button onClick={onGoTo}>Go to {seq}</button>
      <code>{summary}</code>
    </li>
  ),
)

export const StoreView = View.make(
  "StoreView",
  {
    name: Schema.String,
    position: Props.Reactive(Schema.String),
    state: Props.Reactive(Schema.String),
    entries: Props.Element,
    exported: Props.Reactive(Schema.String),
    pasted: Props.Reactive(Schema.String),
    problem: Props.Reactive(Schema.String),
    onBack: Props.Action,
    onForward: Props.Action,
    onLive: Props.Action,
    onExport: Props.Action,
    onPaste: Props.Handler("input", "textarea"),
    onLoad: Props.Action,
  },
  (props) => (
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
  ),
)

export const DeadView = View.make(
  "DeadView",
  { summary: Props.Reactive(Schema.String), onRetry: Props.Action, onDiscard: Props.Action },
  ({ summary, onRetry, onDiscard }) => (
    <li>
      <code>{summary}</code>
      <button onClick={onRetry}>Retry</button>
      <button onClick={onDiscard}>Discard</button>
    </li>
  ),
)

export const OutboxView = View.make(
  "OutboxView",
  { pending: Props.Reactive(Schema.Finite), dead: Props.Element },
  ({ pending, dead }) => (
    <section aria-label="Outbox">
      <h2>Outbox</h2>
      <p>
        Waiting to send: <output aria-label="Outbox waiting">{pending}</output>
      </p>
      <ul aria-label="Not sent">{dead}</ul>
    </section>
  ),
)

export const PanelView = View.make(
  "PanelView",
  { stores: Props.Element, outbox: Schema.Array(Props.Element) },
  ({ stores, outbox }) => (
    <aside aria-label="Developer tools">
      <h2>Stores</h2>
      {stores}
      {outbox}
    </aside>
  ),
)
