import { Schema } from "effect"
import * as Events from "../Events.ts"
import * as Props from "../Props.ts"
import * as Reactive from "../Reactive.ts"
import * as UiState from "../UiState.ts"
import * as View from "../View.ts"

export const MomentView = View.make(
  "MomentView",
  {
    seq: Schema.String,
    kind: Props.Reactive(Schema.String),
    summary: Props.Reactive(Schema.String),
    trace: Props.Reactive(Schema.String),
    current: Props.Reactive(Schema.Boolean),
    scrubbed: Props.Reactive(Schema.Boolean),
    onJump: Props.Action,
    onTrace: Props.Action,
  },
  ({ seq, kind, summary, trace, current, scrubbed, onJump, onTrace }) => (
    <li
      aria-current={current}
      data-scrubbed={Reactive.map(scrubbed, (now) => (now ? "yes" : "no"))}
      data-kind={kind}
      data-moment=""
      onClick={[onJump, onTrace]}
    >
      <span data-seq="">{seq}</span>
      <span data-what="">
        <i data-dot="" /> <span data-kind-name="">{kind}</span> <code>{summary}</code>
      </span>
      <span data-actions="">
        <button
          aria-label={`Jump to ${seq}`}
          title="Show the app as it was here"
          onClick={Events.stop(onJump)}
        >
          ⟲
        </button>
        <button
          aria-label={`Trace ${seq}`}
          title="Show this event's trace"
          onClick={Events.stop(onTrace)}
          hidden={Reactive.map(trace, (id) => id === "")}
        >
          ≋
        </button>
      </span>
      <small aria-label={`Trace of ${seq}`} data-trace-id="">
        {trace}
      </small>
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
    onSelect: Props.Action,
  },
  ({ name, where, took, failed, indent, left, width, note, waitedFrom, waited, onSelect }) => (
    <li
      data-where={where}
      data-failed={Reactive.map(failed, (bad) => (bad ? "yes" : "no"))}
      data-bar=""
      onClick={onSelect}
    >
      <span data-span-name="" style={{ paddingLeft: indent }}>
        <i data-dot="" /> <strong>{name}</strong> <small data-note="">{note}</small>
      </span>
      <span data-track="">
        <span data-waited={waited} data-wait="" style={{ left: waitedFrom, width: waited }} />
        <span data-fill="" style={{ left, width }} />
      </span>
      <span data-took="">{took}</span>
      <span data-status="">
        <small data-side="">{where}</small>{" "}
        <small data-bad="" hidden={Reactive.map(failed, (bad) => !bad)}>
          failed
        </small>
      </span>
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
    chains: Props.Reactive(Schema.String),
    bars: Props.Element,
    lens: Props.Reactive(Schema.String),
    onRefresh: Props.Action,
    onLens: Props.Callback(Schema.String),
  },
  ({ traceId, summary, chains, bars, lens, onRefresh, onLens }) => (
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
      <pre
        aria-label="Chains of requests"
        hidden={Reactive.map(chains, (text) => text === "")}
        data-chains=""
      >
        {chains}
      </pre>
      <ol aria-label="Spans" data-spans="">
        {bars}
      </ol>
    </section>
  ),
)

export const Tick = Schema.Struct({
  seq: Schema.Int,
  kind: Schema.String,
  at: Schema.String,
})

export const LaneView = View.make(
  "LaneView",
  { slot: Schema.String, ticks: Props.Reactive(Schema.String) },
  ({ slot, ticks }) => (
    <li data-lane="">
      <span data-lane-name="">{slot}</span>
      <span data-lane-track="" style={{ background: ticks }} />
    </li>
  ),
)

export const LanesView = View.make(
  "LanesView",
  {
    shown: Props.Reactive(Schema.Boolean),
    lanes: Props.Element,
    marker: Props.Reactive(Schema.String),
    scrubAt: Props.Reactive(Schema.String),
    scrubbing: Props.Reactive(Schema.Boolean),
    onScrub: Props.Handler("pointermove", "div"),
    onStart: Props.Handler("pointerdown", "div"),
    onLetGo: Props.Handler("pointerup", "div"),
  },
  ({ shown, lanes, marker, scrubAt, scrubbing, onScrub, onStart, onLetGo }) => (
    <section aria-label="Lanes" data-area="lanes" hidden={Reactive.map(shown, (now) => !now)}>
      <div
        data-lanes-surface=""
        onPointermove={onScrub}
        onPointerdown={onStart}
        onPointerup={onLetGo}
      >
        <ul>{lanes}</ul>
        <i data-marker="" style={{ left: marker }} />
        <i
          data-scrubber=""
          hidden={Reactive.map(scrubbing, (now) => !now)}
          style={{ left: scrubAt }}
        />
      </div>
    </section>
  ),
)

export const EventView = View.make(
  "EventView",
  {
    heading: Props.Reactive(Schema.String),
    kind: Props.Reactive(Schema.String),
    detail: Props.Reactive(Schema.String),
    traceId: Props.Reactive(Schema.String),
    spanId: Props.Reactive(Schema.String),
    changes: Props.Reactive(Schema.String),
  },
  ({ heading, kind, detail, traceId, spanId, changes }) => (
    <section aria-label="Event">
      <h2>{heading}</h2>
      <table aria-label="About the event">
        <tbody>
          <tr>
            <th scope="row">kind</th>
            <td>{kind}</td>
          </tr>
          <tr>
            <th scope="row">trace</th>
            <td>{traceId}</td>
          </tr>
          <tr>
            <th scope="row">span</th>
            <td>{spanId}</td>
          </tr>
        </tbody>
      </table>
      <h3>What it changed</h3>
      <pre aria-label="What the event changed">{changes}</pre>
      <h3>What it carried</h3>
      <pre aria-label="What the event carried">{detail}</pre>
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
      <button onClick={onSwitch} aria-pressed={current} title={detail}>
        {name}
      </button>
    </li>
  ),
)

export const TravelView = View.make(
  "TravelView",
  {
    position: Props.Reactive(Schema.String),
    live: Props.Reactive(Schema.Boolean),
    branches: Props.Element,
    onBack: Props.Action,
    onForward: Props.Action,
    onLive: Props.Action,
    onFork: Props.Action,
  },
  ({ position, live, branches, onBack, onForward, onLive, onFork }) => (
    <div role="group" aria-label="Time travel" data-travel="">
      <button onClick={onBack} title="Step to the event before">
        Earlier
      </button>
      <output
        aria-label="Timeline position"
        data-live={Reactive.map(live, (now) => (now ? "yes" : "no"))}
      >
        {position}
      </output>
      <button onClick={onForward} title="Step to the event after">
        Later
      </button>
      <button onClick={onLive} disabled={live} title="Leave the past and follow what happens now">
        Back to now
      </button>
      <button onClick={onFork} title="Start a branch from the event you are looking at">
        Fork from here
      </button>
      <ul aria-label="Branches" data-branches="">
        {branches}
      </ul>
    </div>
  ),
)

export const TimelineView = View.make("TimelineView", { moments: Props.Element }, ({ moments }) => (
  <section aria-label="Everything that happened">
    <h2>Everything that happened</h2>
    <ol>{moments}</ol>
  </section>
))

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
  "[data-spar-devtools-sheet] { position: fixed; inset: 0 0 0 auto; width: clamp(760px, 62vw, 1400px); container-type: inline-size; background: #121418; color: #d6d9e0; border-left: 1px solid #262a33; box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35); overflow: hidden; font: 12.5px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif }",
  "[data-spar-devtools-frame] { display: grid; height: 100%; grid-template: 'bar bar' 36px 'lanes lanes' auto 'events trace' minmax(0, 1fr) 'events detail' minmax(0, 32%) / minmax(0, 42%) minmax(0, 1fr) }",
  "@container (min-width: 1150px) { [data-spar-devtools-frame] { grid-template: 'bar bar bar' 36px 'lanes lanes lanes' auto 'events trace detail' minmax(0, 1fr) / 410px minmax(0, 1fr) 340px } }",
  "[data-grow] { flex: 1 }",
  "[data-travel] { display: flex; align-items: center; gap: 4px; min-width: 0 }",
  "[data-travel] output { min-width: 64px; padding: 2px 8px; border-radius: 4px; text-align: center; font-variant-numeric: tabular-nums; background: #2a2210; color: #f5c46b }",
  "[data-travel] output[data-live=yes] { background: #10261a; color: #6fd39a }",
  "[data-travel] button:disabled { opacity: 1; color: #6b7280; border-color: #262a33; cursor: default }",
  "[data-branches] { display: flex; gap: 4px; margin: 0 0 0 8px; padding: 0 0 0 8px; list-style: none; border-left: 1px solid #262a33; overflow-x: auto }",
  "[data-branches]:not(:has(li + li)) { display: none }",
  "[data-tabs] { position: sticky; top: 0; z-index: 2; display: flex; gap: 4px; padding: 6px 10px; background: #15181d; border-bottom: 1px solid #262a33 }",
  "[data-tab][hidden] { display: none }",
  "[data-area=lanes] { grid-area: lanes; max-height: 190px; overflow: auto; border-bottom: 1px solid #262a33; border-right: 0; background: #101216; padding: 0 }",
  "[data-area=lanes][hidden] { display: none }",
  "[data-lanes-surface] { position: relative; cursor: ew-resize; user-select: none; touch-action: none }",
  "[data-lane] { display: grid; grid-template-columns: 180px minmax(0, 1fr); height: 18px; border-bottom: 1px solid #191c22 }",
  "[data-lane-name] { padding: 0 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8a91a0; font: 11px/18px ui-monospace, Menlo, monospace }",
  "[data-lane-track] { position: relative; margin-right: 12px; background-repeat: no-repeat }",
  "[data-tick] { position: absolute; top: 4px; width: 6px; height: 10px; margin-left: -3px; border-radius: 2px; background: #6ea8fe }",
  "[data-tick][data-kind=ui] { background: #c39bff } [data-tick][data-kind=route] { background: #f0b45a } [data-tick][data-kind=data] { background: #4fd1c5 } [data-tick][data-kind=call] { background: #8bd17c } [data-tick][data-kind=noticed], [data-tick][data-kind=refused] { background: #ff8a94 }",
  "[data-marker], [data-scrubber] { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; pointer-events: none }",
  "[data-marker] { background: #ffffff; opacity: 0.85 } [data-scrubber] { background: #f0b45a }",
  "[data-moment][data-scrubbed=yes] { background: #3a2e17; color: #fff }",
  "[data-spar-devtools-sheet][hidden] { display: none }",
  "html:has([data-spar-devtools-sheet]:not([hidden])) body { margin-inline-end: clamp(760px, 62vw, 1400px) }",
  "@media (max-width: 1000px) { [data-spar-devtools-sheet] { inset: auto 0 0 0; width: 100%; height: 60vh; border-left: 0; border-top: 1px solid #262a33 } html:has([data-spar-devtools-sheet]:not([hidden])) body { margin-inline-end: 0; margin-block-end: 60vh } }",
  "[data-area] { min-height: 0; overflow: auto; border-right: 1px solid #262a33 }",
  "[data-area=detail] { border-right: 0 }",
  "[data-area=bar] { grid-area: bar; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid #262a33; background: #15181d; overflow: hidden }",
  "[data-area=bar] strong { color: #f1f3f6 }",
  "[data-area=events] { grid-area: events } [data-area=trace] { grid-area: trace } [data-area=detail] { grid-area: detail }",
  "[data-spar-devtools] h2 { position: sticky; top: 0; z-index: 1; margin: 0; padding: 8px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #8a91a0; background: #121418; border-bottom: 1px solid #262a33 }",
  "[data-spar-devtools] h3 { margin: 12px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280 }",
  "[data-spar-devtools] p { margin: 6px 12px }",
  "[data-spar-devtools] small { color: #8a91a0 }",
  "[data-spar-devtools] button { font: inherit; font-size: 11.5px; padding: 2px 9px; border-radius: 999px; border: 1px solid #2c313b; background: #171a20; color: #c7cbd4; cursor: pointer }",
  "[data-spar-devtools] button:hover { border-color: #3d4452; color: #fff }",
  "[data-spar-devtools] button[aria-pressed=true] { border-color: #6ea8fe; background: #1b2a44; color: #fff }",
  "[data-spar-devtools] code, [data-spar-devtools] pre, [data-spar-devtools] textarea, [data-spar-devtools] output { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace }",
  "[data-spar-devtools] pre { margin: 6px 12px; padding: 8px 10px; max-height: 220px; overflow: auto; background: #0e1014; border: 1px solid #262a33; border-radius: 6px; color: #d6d9e0 }",
  "[data-spar-devtools] textarea { width: calc(100% - 24px); margin: 4px 12px; background: #0e1014; color: #d6d9e0; border: 1px solid #262a33; border-radius: 6px }",
  "[data-spar-devtools] table { border-collapse: collapse; width: 100% }",
  "[data-spar-devtools] th, [data-spar-devtools] td { padding: 3px 12px; text-align: left; vertical-align: top; font: 12px/1.5 ui-monospace, Menlo, monospace }",
  "[data-spar-devtools] th { color: #8a91a0; font-weight: 400; white-space: nowrap }",
  "[data-spar-devtools] ol, [data-spar-devtools] ul { list-style: none; margin: 0; padding: 0 }",
  "[data-moment] { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 2px 10px; border-bottom: 1px solid #191c22; font: 12px/1.6 ui-monospace, Menlo, monospace }",
  "[data-moment]:hover { background: #171b22 }",
  "[data-moment][aria-current=true] { background: #1b2a44; color: #fff }",
  "[data-seq] { color: #5d6472; text-align: right }",
  "[data-what] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }",
  "[data-what] code { color: #d6d9e0 } [data-kind-name] { color: #8a91a0 }",
  "[data-dot] { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #6ea8fe; vertical-align: 1px }",
  "[data-kind=ui] [data-dot] { background: #c39bff } [data-kind=route] [data-dot] { background: #f0b45a } [data-kind=data] [data-dot] { background: #4fd1c5 } [data-kind=call] [data-dot] { background: #8bd17c } [data-kind=refused] [data-dot], [data-kind=noticed] [data-dot] { background: #ff8a94 } [data-kind=waited] [data-dot] { background: #f0b45a }",
  "[data-moment] { cursor: pointer }",
  "[data-actions] { display: flex; gap: 2px; opacity: 0 } [data-moment]:hover [data-actions], [data-moment][aria-current=true] [data-actions] { opacity: 1 }",
  "[data-actions] button { width: 22px; height: 20px; padding: 0; border-radius: 4px; line-height: 18px; text-align: center }",
  "[data-trace-id] { display: none }",
  "[data-bar] { display: grid; grid-template-columns: minmax(0, 44%) minmax(0, 1fr) 72px 92px; align-items: center; gap: 8px; padding: 2px 12px; border-bottom: 1px solid #191c22; font: 12px/1.6 ui-monospace, Menlo, monospace }",
  "[data-bar] { cursor: pointer } [data-bar]:hover { background: #171b22 }",
  "[data-span-name] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } [data-span-name] strong { font-weight: 400; color: #e6e8ec }",
  "[data-bar][data-where=backend] [data-dot], [data-bar][data-where=backend] [data-fill] { background: #4fd1c5 }",
  "[data-bar][data-failed=yes] [data-fill] { background: #ff8a94 }",
  "[data-track] { position: relative; height: 10px; background: #1a1d23; border-radius: 2px }",
  "[data-fill] { position: absolute; top: 1px; height: 8px; min-width: 2px; border-radius: 2px; background: #6ea8fe }",
  "[data-wait] { position: absolute; top: 4px; height: 2px; background: #f0b45a }",
  "[data-took] { text-align: right; color: #aab0bd }",
  "[data-bar] { position: relative }",
  "[data-bar][data-where=page] + [data-bar][data-where=backend], [data-bar][data-where=backend] + [data-bar][data-where=page] { margin-top: 20px; border-top: 1px dashed #5c4a24 }",
  "[data-bar][data-where=page] + [data-bar][data-where=backend]::before, [data-bar][data-where=backend] + [data-bar][data-where=page]::before { position: absolute; left: 12px; top: -19px; font: 10.5px/18px ui-monospace, Menlo, monospace; letter-spacing: 0.04em; color: #f0b45a }",
  "[data-bar][data-where=page] + [data-bar][data-where=backend]::before { content: '↓ over the network · backend' }",
  "[data-bar][data-where=backend] + [data-bar][data-where=page]::before { content: '↑ back in the page' }",
  "[data-bar][data-where=backend] { background: rgba(79, 209, 197, 0.04) }",
  "[data-bad] { color: #ff8a94 } [data-side] { color: #6b7280 }",
  "[data-chains] { color: #f0b45a }",
  "[data-spar-devtools] section { padding-bottom: 8px }",
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
  position: "relative",
  zIndex: "1",
}

export const ToolsView = View.make(
  "ToolsView",
  {
    open: Props.State(Schema.Boolean),
    lanesShown: Props.State(Schema.Boolean),
    detailTab: Props.State(Schema.String),
    spanAbout: Props.Reactive(Schema.String),
    event: Props.Element,
    inspector: Props.Element,
    travel: Props.Element,
    lanes: Props.Element,
    timeline: Props.Element,
    trace: Props.Element,
    stores: Props.Element,
  },
  ({
    open,
    lanesShown,
    detailTab,
    spanAbout,
    event,
    inspector,
    travel,
    lanes,
    timeline,
    trace,
    stores,
  }) => (
    <aside aria-label="Spar devtools" data-spar-devtools="" style={dock}>
      <style>{look}</style>
      <button aria-expanded={open} style={toggle} onClick={UiState.update(open, (shown) => !shown)}>
        Devtools
      </button>
      <div hidden={Reactive.map(open, (shown) => !shown)} data-spar-devtools-sheet="">
        <div data-spar-devtools-frame="">
          <header data-area="bar">
            <strong>Spar</strong>
            {travel}
            <span data-grow="" />
            <button
              aria-pressed={lanesShown}
              title="Show or hide the lanes: one row per slot, a tick per event; drag across them to scrub"
              onClick={UiState.update(lanesShown, (shown) => !shown)}
            >
              Lanes
            </button>
          </header>
          {lanes}
          <div data-area="events">{timeline}</div>
          <div data-area="trace">{trace}</div>
          <div data-area="detail">
            <nav data-tabs="" aria-label="Detail">
              <button
                aria-pressed={Reactive.map(detailTab, (tab) => tab === "event")}
                onClick={UiState.set(detailTab, "event")}
              >
                Event
              </button>
              <button
                aria-pressed={Reactive.map(detailTab, (tab) => tab === "span")}
                onClick={UiState.set(detailTab, "span")}
              >
                Span
              </button>
              <button
                aria-pressed={Reactive.map(detailTab, (tab) => tab === "stores")}
                onClick={UiState.set(detailTab, "stores")}
              >
                Stores
              </button>
            </nav>
            <div data-tab="" hidden={Reactive.map(detailTab, (tab) => tab !== "event")}>
              {event}
            </div>
            <div data-tab="" hidden={Reactive.map(detailTab, (tab) => tab !== "span")}>
              <section aria-label="Span">
                <h2>Span</h2>
                <pre aria-label="The picked span">
                  {Reactive.map(spanAbout, (about) =>
                    about === "" ? "Pick a span in the trace to see it here." : about,
                  )}
                </pre>
              </section>
            </div>
            <div data-tab="" hidden={Reactive.map(detailTab, (tab) => tab !== "stores")}>
              {stores}
            </div>
            {inspector}
          </div>
        </div>
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
    changed: Props.Reactive(Schema.String),
    entries: Props.Element,
    exported: Props.Reactive(Schema.String),
    pasted: Props.State(Schema.String),
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
      <h4>What the action changed</h4>
      <pre aria-label={`${props.name} changed`}>{props.changed}</pre>
      <h4>State</h4>
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
