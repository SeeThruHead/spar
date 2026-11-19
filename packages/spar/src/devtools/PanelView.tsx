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

const veil = {
  position: "fixed",
  inset: "0",
  zIndex: "2147482000",
  cursor: "crosshair",
  background: "rgba(29, 78, 216, 0.04)",
}

export const VeilView = View.make(
  "VeilView",
  { onMove: Props.Handler("pointermove"), onPick: Props.Handler("click") },
  ({ onMove, onPick }) => (
    <div
      role="button"
      tabIndex={0}
      aria-label="Pick a component on the page"
      style={veil}
      onPointermove={onMove}
      onClick={onPick}
    />
  ),
)

export const OutlineView = View.make(
  "OutlineView",
  {
    name: Props.Reactive(Schema.String),
    left: Props.Reactive(Schema.String),
    top: Props.Reactive(Schema.String),
    width: Props.Reactive(Schema.String),
    height: Props.Reactive(Schema.String),
  },
  ({ name, left, top, width, height }) => (
    <div
      aria-label="Highlighted component"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        zIndex: "2147482500",
        boxSizing: "border-box",
        pointerEvents: "none",
        border: "2px solid #1d4ed8",
        borderRadius: "4px",
        background: "rgba(29, 78, 216, 0.10)",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          padding: "1px 6px",
          borderRadius: "2px 0 4px 0",
          background: "#1d4ed8",
          color: "#ffffff",
          font: "600 11px/1.5 system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  ),
)

const cell = { padding: "2px 10px 2px 0", verticalAlign: "top", textAlign: "left" }

export const FactView = View.make(
  "FactView",
  { name: Props.Reactive(Schema.String), value: Props.Reactive(Schema.String) },
  ({ name, value }) => (
    <tr>
      <th scope="row" style={{ ...cell, fontWeight: "600", whiteSpace: "nowrap" }}>
        {name}
      </th>
      <td style={cell}>
        <code>{value}</code>
      </td>
    </tr>
  ),
)

export const ChangeView = View.make(
  "ChangeView",
  {
    what: Props.Reactive(Schema.String),
    from: Props.Reactive(Schema.String),
    to: Props.Reactive(Schema.String),
    when: Props.Reactive(Schema.String),
  },
  ({ what, from, to, when }) => (
    <li>
      <strong>{what}</strong> <code>{from}</code> became <code>{to}</code> <small>{when}</small>
    </li>
  ),
)

export const InspectorView = View.make(
  "InspectorView",
  {
    picking: Props.Reactive(Schema.Boolean),
    name: Props.Reactive(Schema.String),
    place: Props.Reactive(Schema.String),
    services: Props.Reactive(Schema.String),
    props: Props.Element,
    state: Props.Element,
    changes: Props.Element,
    veil: Props.Element,
    outline: Props.Element,
    onPick: Props.Action,
  },
  ({ picking, name, place, services, props, state, changes, veil: over, outline, onPick }) => (
    <section aria-label="Component inspector">
      <h2>Inspector</h2>
      <p>
        <button aria-pressed={picking} onClick={onPick}>
          Pick a component
        </button>{" "}
        <output aria-label="Picked component">{name}</output>
      </p>
      <p>
        <small aria-label="Where it is">{place}</small>
      </p>
      <h3>Props</h3>
      <table aria-label="Props">
        <tbody>{props}</tbody>
      </table>
      <h3>UI state</h3>
      <table aria-label="UI state">
        <tbody>{state}</tbody>
      </table>
      <h3>Services</h3>
      <p aria-label="Services">{services}</p>
      <h3>What changed</h3>
      <ol aria-label="What changed">{changes}</ol>
      {over}
      {outline}
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
  {
    open: Props.State(Schema.Boolean),
    inspector: Props.Element,
    timeline: Props.Element,
    stores: Props.Element,
  },
  ({ open, inspector, timeline, stores }) => (
    <aside aria-label="Spar devtools" data-spar-devtools="" style={dock}>
      <button aria-expanded={open} style={toggle} onClick={UiState.update(open, (shown) => !shown)}>
        Devtools
      </button>
      <div hidden={Reactive.map(open, (shown) => !shown)} style={sheet}>
        {inspector}
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
