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
    onTrace: Props.Action,
  },
  ({ seq, summary, trace, current, onJump, onTrace }) => (
    <li aria-current={current}>
      <button onClick={onJump}>Jump to {seq}</button> <button onClick={onTrace}>Trace {seq}</button>
      <code>{summary}</code> <small aria-label={`Trace of ${seq}`}>{trace}</small>
    </li>
  ),
)

export const BarView = View.make(
  "BarView",
  {
    name: Props.Reactive(Schema.String),
    where: Props.Reactive(Schema.String),
    took: Props.Reactive(Schema.String),
    failed: Props.Reactive(Schema.Boolean),
    indent: Props.Reactive(Schema.String),
    left: Props.Reactive(Schema.String),
    width: Props.Reactive(Schema.String),
    note: Props.Reactive(Schema.String),
    waitedFrom: Props.Reactive(Schema.String),
    waited: Props.Reactive(Schema.String),
  },
  ({ name, where, took, failed, indent, left, width, note, waitedFrom, waited }) => (
    <li
      data-where={where}
      data-failed={Reactive.map(failed, (bad) => (bad ? "yes" : "no"))}
      style={{ listStyle: "none", padding: "2px 0" }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline", paddingLeft: indent }}>
        <strong>{name}</strong>
        <small>{where}</small>
        <small>{took}</small>
        <small>{note}</small>
        <small hidden={Reactive.map(failed, (bad) => !bad)} style={{ color: "#b42318" }}>
          failed
        </small>
      </div>
      <div
        style={{ position: "relative", height: "6px", background: "#eef1f5", borderRadius: "3px" }}
      >
        <div
          data-waited={waited}
          style={{
            position: "absolute",
            top: "2px",
            height: "2px",
            left: waitedFrom,
            width: waited,
            background: "#b54708",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "0",
            bottom: "0",
            left,
            width,
            minWidth: "2px",
            borderRadius: "3px",
            background: Reactive.map(where, (side) => (side === "backend" ? "#0f766e" : "#1d4ed8")),
          }}
        />
      </div>
    </li>
  ),
)

const LensView = View.make(
  "LensView",
  {
    name: Schema.String,
    label: Schema.String,
    lens: Props.Reactive(Schema.String),
    onLens: Props.Callback(Schema.String),
  },
  ({ name, label, lens, onLens }) => (
    <button onClick={() => onLens(name)} aria-pressed={Reactive.map(lens, (now) => now === name)}>
      {label}
    </button>
  ),
)

export const TraceView = View.make(
  "TraceView",
  {
    traceId: Props.Reactive(Schema.String),
    summary: Props.Reactive(Schema.String),
    bars: Props.Element,
    lens: Props.Reactive(Schema.String),
    onRefresh: Props.Action,
    onLens: Props.Callback(Schema.String),
  },
  ({ traceId, summary, bars, lens, onRefresh, onLens }) => (
    <section aria-label="Trace">
      <h2>Trace</h2>
      <p>
        <output aria-label="Trace shown">{summary}</output> <small>{traceId}</small>{" "}
        <button onClick={onRefresh}>Refresh trace</button>
      </p>
      <p aria-label="Lens">
        <LensView name="all" label="Everything" lens={lens} onLens={onLens} />{" "}
        <LensView name="rendering" label="Rendering" lens={lens} onLens={onLens} />{" "}
        <LensView name="data" label="Data" lens={lens} onLens={onLens} />{" "}
        <LensView name="stores" label="Stores" lens={lens} onLens={onLens} />{" "}
        <LensView name="backend" label="Backend" lens={lens} onLens={onLens} />
      </p>
      <ol aria-label="Spans" style={{ paddingLeft: "0" }}>
        {bars}
      </ol>
    </section>
  ),
)

export const BranchView = View.make(
  "BranchView",
  {
    name: Props.Reactive(Schema.String),
    detail: Props.Reactive(Schema.String),
    current: Props.Reactive(Schema.Boolean),
    onSwitch: Props.Action,
  },
  ({ name, detail, current, onSwitch }) => (
    <li data-current={current}>
      <button onClick={onSwitch} aria-pressed={current}>
        {name}
      </button>{" "}
      <span>{detail}</span>
    </li>
  ),
)

export const TimelineView = View.make(
  "TimelineView",
  {
    position: Props.Reactive(Schema.String),
    moments: Props.Element,
    branches: Props.Element,
    onBack: Props.Action,
    onForward: Props.Action,
    onLive: Props.Action,
    onFork: Props.Action,
  },
  ({ position, moments, branches, onBack, onForward, onLive, onFork }) => (
    <section aria-label="Everything that happened">
      <h2>Everything that happened</h2>
      <p>
        <output aria-label="Timeline position">{position}</output>{" "}
        <button onClick={onBack}>Earlier</button> <button onClick={onForward}>Later</button>{" "}
        <button onClick={onLive}>Back to now</button>{" "}
        <button onClick={onFork}>Fork from here</button>
      </p>
      <ul aria-label="Branches">{branches}</ul>
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
  {
    name: Props.Reactive(Schema.String),
    value: Props.Reactive(Schema.String),
    from: Props.Reactive(Schema.String),
  },
  ({ name, value, from }) => (
    <tr>
      <th scope="row" style={{ ...cell, fontWeight: "600", whiteSpace: "nowrap" }}>
        {name}
      </th>
      <td style={cell}>
        <code>{value}</code> <small>{from}</small>
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
    recovers: Props.Reactive(Schema.String),
    props: Props.Element,
    state: Props.Element,
    changes: Props.Element,
    veil: Props.Element,
    outline: Props.Element,
    onPick: Props.Action,
  },
  ({
    picking,
    name,
    place,
    services,
    recovers,
    props,
    state,
    changes,
    veil: over,
    outline,
    onPick,
  }) => (
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
      <h3>Failures it recovers from</h3>
      <p aria-label="Failures it recovers from">{recovers}</p>
      <h3>What changed</h3>
      <ol aria-label="What changed">{changes}</ol>
      {over}
      {outline}
    </section>
  ),
)

const look = [
  "[data-spar-devtools] * { box-sizing: border-box }",
  "[data-spar-devtools] h2 { font-size: 14px; margin: 16px 0 8px; padding-top: 12px; border-top: 1px solid #e3e7ee }",
  "[data-spar-devtools] section:first-of-type h2 { border-top: 0; padding-top: 0 }",
  "[data-spar-devtools] h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #4b5666; margin: 14px 0 4px }",
  "[data-spar-devtools] p { margin: 4px 0 }",
  "[data-spar-devtools] button { font: inherit; padding: 3px 10px; border-radius: 6px; border: 1px solid #aab3c2; background: #f5f7fa; color: #141a22; cursor: pointer }",
  "[data-spar-devtools] button:hover { background: #e9edf3 }",
  "[data-spar-devtools] button[aria-pressed=true] { background: #1d4ed8; border-color: #1d4ed8; color: #ffffff }",
  "[data-spar-devtools] code, [data-spar-devtools] pre, [data-spar-devtools] textarea { font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace }",
  "[data-spar-devtools] table { border-collapse: collapse; width: 100% }",
  "[data-spar-devtools] tr + tr { border-top: 1px solid #eef1f5 }",
  "[data-spar-devtools] ol { margin: 4px 0; padding-left: 22px }",
  "[data-spar-devtools] li { margin: 3px 0; padding: 1px 4px }",
  "[data-spar-devtools] li[aria-current=true] { background: #eaf0ff; border-radius: 4px }",
  "[data-spar-devtools] small { color: #4b5666 }",
  "[data-spar-devtools] textarea { width: 100% }",
  "[data-spar-devtools] pre { max-height: 180px; overflow: auto; background: #f5f7fa; padding: 8px; border-radius: 6px }",
].join("\n")

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
    trace: Props.Element,
    stores: Props.Element,
  },
  ({ open, inspector, timeline, trace, stores }) => (
    <aside aria-label="Spar devtools" data-spar-devtools="" style={dock}>
      <style>{look}</style>
      <button aria-expanded={open} style={toggle} onClick={UiState.update(open, (shown) => !shown)}>
        Devtools
      </button>
      <div hidden={Reactive.map(open, (shown) => !shown)} style={sheet}>
        {inspector}
        {timeline}
        {trace}
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
