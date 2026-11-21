import {
  Array,
  Context,
  Effect,
  Formatter,
  Layer,
  Option,
  Order,
  Predicate,
  Record,
  Schema,
  Stream,
  pipe,
} from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { run } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell, observed } from "./internal/reactive.ts"
import {
  BarView,
  ChangeView,
  DeadView,
  EntryView,
  FactView,
  EventView,
  InspectorView,
  LaneView,
  LanesView,
  MomentView,
  OutboxView,
  OutlineView,
  PanelView,
  StoreView,
  BranchView,
  TimelineView,
  TravelView,
  ToolsView,
  Tick as TickSchema,
  TraceView,
  VeilView,
} from "./devtools/PanelView.tsx"
import * as Events from "./Events.ts"
import * as Spans from "./devtools/spans.ts"
import { backendPath } from "./devtools/paths.ts"
import * as Dom from "./internal/dom.ts"
import { starter } from "./internal/listen.ts"
import { Inspecting, inspecting, mark, sourceOf } from "./internal/inspect.ts"
import type { Placed, Seen } from "./internal/inspect.ts"
import * as Outbox from "./Outbox.ts"
import * as Reactive from "./Reactive.ts"
import * as Store from "./Store.ts"
import * as Timeline from "./Timeline.ts"
import * as Shown from "./internal/props.ts"
import * as Props from "./Props.ts"
import * as UiState from "./UiState.ts"
import * as Trees from "./internal/uiTrees.ts"
import * as View from "./View.ts"
import { compose, withProps } from "./Compose.ts"

type OutboxService = Context.Service.Shape<typeof Outbox.Outbox>

export const InspectedStore = Shown.kind(
  (value): value is Store.Inspected => Predicate.hasProperty(value, "travelTo"),
  Shown.named("store"),
)

export const OutboxShown = Shown.kind(
  (value): value is OutboxService => Predicate.hasProperty(value, "persist"),
  Shown.named("outbox"),
)

export const Branch = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  from: Schema.NullOr(Schema.Int),
  moments: Schema.Int,
  current: Schema.Boolean,
})

export type Branch = typeof Branch.Type

export class Registry extends Context.Service<
  Registry,
  {
    readonly stores: Reactive.Reactive<ReadonlyArray<Store.Inspected>>
    readonly moments: Reactive.Reactive<ReadonlyArray<Timeline.Moment>>
    readonly viewing: Reactive.Reactive<number | null>
    readonly travelTo: (seq: number | null) => Effect.Effect<void>
    readonly uiState: () => UiState.Snapshot
    readonly changesAt: (seq: number | null) => ReadonlyArray<string>
    readonly setUi: (path: UiState.Path, name: string, value: Schema.Json) => boolean
    readonly follow: (tree: ReturnType<typeof Trees.makeTree>) => void
    readonly branches: Reactive.Reactive<ReadonlyArray<Branch>>
    readonly fork: Effect.Effect<void>
    readonly switchTo: (id: number) => Effect.Effect<void>
    readonly step: (by: -1 | 1) => Effect.Effect<void>
  }
>()("spar/Devtools/Registry") {}

type Remembered = {
  readonly moment: Timeline.Moment
  readonly ui: UiState.Snapshot
  readonly stores: Readonly<Record<string, number>>
}

type Kept = { readonly ui: UiState.Snapshot; readonly stores: Readonly<Record<string, number>> }

const uiPlace = (entry: UiState.Snapshot[number]): string =>
  [...entry.path, entry.name].join(" / ").replace(/ \/ (?=[^/]*$)/, " . ")

const valueText = (value: Schema.Json): string => Formatter.formatJson(value)

export const changeLines = (before: Kept | undefined, now: Kept): ReadonlyArray<string> => {
  const earlier = before?.ui ?? []
  const was = new Map(earlier.map((entry) => [uiPlace(entry), entry.value]))
  const is = new Map(now.ui.map((entry) => [uiPlace(entry), entry.value]))
  const changed = now.ui.flatMap((entry) => {
    const place = uiPlace(entry)
    const found = was.get(place)
    if (found === undefined) return [`+ ${place}  ${valueText(entry.value)}`]

    const old = valueText(found)
    const next = valueText(entry.value)

    return old === next ? [] : [`${place}  ${old} → ${next}`]
  })
  const gone = earlier
    .filter((entry) => !is.has(uiPlace(entry)))
    .map((entry) => `- ${uiPlace(entry)}`)
  const moved = Object.entries(now.stores)
    .filter(([key, at]) => before?.stores[key] !== at)
    .map(([key, at]) => `${key}  entry ${before?.stores[key] ?? "none"} → ${at}`)

  return [...moved, ...changed, ...gone]
}

type Named = { readonly id: number; readonly name: string; readonly from: number | null }

type Parked = Named & {
  readonly remembered: ReadonlyArray<Remembered>
  readonly ui: UiState.Snapshot
  readonly resume: Effect.Effect<void>
}

type Past = {
  readonly remembered: ReadonlyArray<Remembered>
  readonly viewing: number | null
  readonly live: UiState.Snapshot
  readonly branch: Named
  readonly others: ReadonlyArray<Parked>
  readonly made: number
}

const main: Named = { id: 0, name: "Main", from: null }

const reportsOnly: ReadonlySet<Timeline.Kind> = new Set(["waited", "noticed"])

const changesState = (kind: Timeline.Kind): boolean => !reportsOnly.has(kind)

const changesIn = (remembered: ReadonlyArray<Remembered>): number =>
  remembered.filter((kept) => changesState(kept.moment.kind)).length

const branchesOf = (now: Past): ReadonlyArray<Branch> =>
  Array.sort(
    [
      { ...now.branch, moments: changesIn(now.remembered), current: true },
      ...now.others.map((parked) => ({
        id: parked.id,
        name: parked.name,
        from: parked.from,
        moments: changesIn(parked.remembered),
        current: false,
      })),
    ],
    Order.mapInput(Order.Number, (branch: Branch) => branch.id),
  )

const keepMoments = 1000

const reachedBy = (store: Store.Inspected) =>
  Effect.map(
    store.log.get,
    (log) =>
      [
        store.key,
        Option.getOrElse(
          Option.map(Array.last(log), (entry) => entry.seq),
          () => store.base,
        ),
      ] as const,
  )

export const layer: Layer.Layer<Registry> = Layer.effectContext(
  Effect.gen(function* () {
    const first = yield* Trees.Tree

    first.keepAtLeast(1000)

    const trees = Cell.make(first)
    const stores = Cell.make<ReadonlyArray<Store.Inspected>>([])
    const past = Cell.make<Past>({
      remembered: [],
      viewing: null,
      live: [],
      branch: main,
      others: [],
      made: 0,
    })

    const record = Effect.fnUntraced(function* (noted: Timeline.Noted) {
      const tree = yield* Trees.Tree
      const reached = yield* Effect.forEach(stores.read(), reachedBy)
      trees.write(tree)

      const before = past.read()
      const seq =
        Option.getOrElse(
          Option.map(Array.last(before.remembered), (last) => last.moment.seq),
          () => 0,
        ) + 1

      past.write({
        ...before,
        remembered: [
          ...before.remembered,
          { moment: { ...noted, seq }, ui: tree.uiSnapshot(), stores: Object.fromEntries(reached) },
        ].slice(-keepMoments),
      })
    })

    const show = (stored: Option.Option<Readonly<Record<string, number>>>, ui: UiState.Snapshot) =>
      Effect.andThen(
        Effect.forEach(
          stores.read(),
          (store) =>
            store.travelTo(
              Option.getOrNull(
                Option.map(stored, (reached) =>
                  Option.getOrElse(Record.get(reached, store.key), () => store.base),
                ),
              ),
            ),
          { discard: true },
        ),
        Effect.sync(() => trees.read().restore(ui)),
      )

    const travelTo = Effect.fnUntraced(function* (seq: number | null) {
      const before = past.read()
      const live = before.viewing === null ? trees.read().uiSnapshot() : before.live
      const found = Array.findFirst(before.remembered, (kept) => kept.moment.seq === seq)

      yield* Option.match(found, {
        onNone: () => show(Option.none(), live),
        onSome: (kept) => show(Option.some(kept.stores), kept.ui),
      })
      past.write({
        ...before,
        live,
        viewing: Option.getOrNull(Option.map(found, (kept) => kept.moment.seq)),
      })
    })

    const held = Effect.suspend(() =>
      Effect.map(
        Effect.forEach(stores.read(), (store) => store.hold),
        (restorers) => Effect.all(restorers, { discard: true }),
      ),
    )

    const parked = (before: Past, resume: Effect.Effect<void>): Parked => ({
      ...before.branch,
      remembered: before.remembered,
      ui: before.viewing === null ? trees.read().uiSnapshot() : before.live,
      resume,
    })

    const forkFrom = Effect.fnUntraced(function* (before: Past, kept: Remembered) {
      const resume = yield* held

      yield* Effect.forEach(
        stores.read(),
        (store) =>
          store.forkAt(Option.getOrElse(Record.get(kept.stores, store.key), () => store.base)),
        { discard: true },
      )
      past.write({
        remembered: before.remembered.filter((other) => other.moment.seq <= kept.moment.seq),
        viewing: null,
        live: [],
        branch: { id: before.made + 1, name: `Fork ${before.made + 1}`, from: kept.moment.seq },
        others: [...before.others, parked(before, resume)],
        made: before.made + 1,
      })
    })

    const fork = Effect.suspend(() => {
      const before = past.read()

      return Option.match(
        Option.orElse(
          Array.findFirst(before.remembered, (kept) => kept.moment.seq === before.viewing),
          () => Array.findLast(before.remembered, (kept) => changesState(kept.moment.kind)),
        ),
        { onNone: () => Effect.void, onSome: (kept) => forkFrom(before, kept) },
      )
    })

    const resumeIn = Effect.fnUntraced(function* (before: Past, target: Parked) {
      const resume = yield* held
      const leaving = parked(before, resume)

      yield* target.resume
      trees.read().restore(target.ui)
      past.write({
        ...before,
        remembered: target.remembered,
        viewing: null,
        live: [],
        branch: { id: target.id, name: target.name, from: target.from },
        others: [...before.others.filter((other) => other.id !== target.id), leaving],
      })
    })

    const switchTo = (id: number) =>
      Effect.andThen(
        travelTo(null),
        Effect.suspend(() => {
          const before = past.read()

          return Option.match(
            Array.findFirst(before.others, (other) => other.id === id),
            { onNone: () => Effect.void, onSome: (target) => resumeIn(before, target) },
          )
        }),
      )

    const step = (by: -1 | 1) =>
      Effect.suspend(() => {
        const now = past.read()

        return travelTo(
          neighbour(
            now.remembered.map((kept) => kept.moment.seq),
            now.viewing,
            by,
          ),
        )
      })

    return Context.make(Registry, {
      branches: Reactive.map(fromCell(past), branchesOf),
      fork,
      switchTo,
      step,
      stores: fromCell(stores),
      moments: Reactive.map(fromCell(past), (now) => now.remembered.map((kept) => kept.moment)),
      viewing: Reactive.map(fromCell(past), (now) => now.viewing),
      travelTo,
      uiState: () => trees.read().uiSnapshot(),
      changesAt: (seq) => {
        const all = past.read().remembered
        const index =
          seq === null ? all.length - 1 : all.findIndex((kept) => kept.moment.seq === seq)

        return all.slice(index, index + 1).flatMap((now) => changeLines(all[index - 1], now))
      },
      setUi: (path, name, value) => trees.read().put(path, name, value),
      follow: (tree) => {
        tree.keepAtLeast(1000)
        trees.write(tree)
      },
    }).pipe(
      Context.add(Store.Inspector, {
        keepStates: 1000,
        register: (store) => Effect.sync(() => stores.write([...stores.read(), store])),
        forget: (key) =>
          Effect.sync(() => stores.write(stores.read().filter((store) => store.key !== key))),
      }),
      Context.add(Timeline.Recorder, Option.some(record)),
    )
  }),
)

const summaryOf = (entry: Store.Entry): string =>
  `${entry.action} ${Formatter.formatJson(entry.payload)}`

const placeOf = (seqs: ReadonlyArray<number>, viewing: number | null): number =>
  viewing === null ? seqs.length - 1 : seqs.indexOf(viewing)

const before = (seqs: ReadonlyArray<number>, viewing: number | null): number | null =>
  seqs.at(Math.max(placeOf(seqs, viewing) - 1, 0)) ?? null

const after = (seqs: ReadonlyArray<number>, viewing: number | null): number | null =>
  seqs.at(placeOf(seqs, viewing) + 1) ?? null

const step = Effect.fnUntraced(function* (
  store: Store.Inspected,
  next: (seqs: ReadonlyArray<number>, viewing: number | null) => number | null,
) {
  const entries = yield* store.log.get
  const viewing = yield* store.viewing.get

  yield* store.travelTo(
    next(
      entries.map((entry) => entry.seq),
      viewing,
    ),
  )
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const printed = (value: unknown): string => shortened(Formatter.formatJson(value))

const fieldOf = (record: Readonly<Record<string, unknown>>, key: string): string =>
  Object.hasOwn(record, key) ? printed(record[key]) : "(absent)"

export const fieldChanges = (prior: unknown, next: unknown): ReadonlyArray<string> => {
  if (!isRecord(prior) || !isRecord(next)) {
    return printed(prior) === printed(next) ? [] : [`${printed(prior)} → ${printed(next)}`]
  }

  return [...new Set([...Object.keys(prior), ...Object.keys(next)])]
    .filter((key) => fieldOf(prior, key) !== fieldOf(next, key))
    .map((key) => `${key}: ${fieldOf(prior, key)} → ${fieldOf(next, key)}`)
}

const changedText = (lines: ReadonlyArray<string>): string =>
  lines.length === 0 ? "Nothing in this store changed." : lines.join("\n")

const changedBy = (
  store: Store.Inspected,
  viewing: number | null,
  log: ReadonlyArray<Store.Entry>,
) =>
  Option.match(Option.fromNullishOr(viewing ?? log.at(-1)?.seq), {
    onNone: () => Effect.succeed("No action yet."),
    onSome: (seq) =>
      Effect.map(Effect.all([store.stateAt(seq - 1), store.stateAt(seq)]), ([prior, next]) =>
        changedText(fieldChanges(prior, next)),
      ),
  })

const StorePanel = compose(
  withProps({ inspected: Props.Reactive(InspectedStore) }),
  Effect.fnUntraced(function* (props) {
    const store = yield* props.inspected.get
    const entries = yield* pipe(
      store.log,
      Reactive.mapBy(
        (entry: Store.Entry) => String(entry.seq),
        EntryView,
        (entry, seq) => ({
          seq,
          summary: Reactive.map(entry, summaryOf),
          current: Reactive.map(store.viewing, (viewing) => String(viewing) === seq),
          onGoTo: store.travelTo(Number(seq)),
        }),
      ),
    )

    const watched = yield* Reactive.zip(store.viewing, store.log)
    const changed = yield* Reactive.fromStream(
      "",
      Stream.mapEffect(watched.changes, ([viewing, log]) => changedBy(store, viewing, log)),
    )
    const exported = yield* UiState.make("exported", Schema.String, "")
    const pasted = yield* UiState.make("pasted", Schema.String, "")
    const problem = yield* UiState.make("problem", Schema.String, "")
    const say = (text: string) => run(UiState.set(problem, text))

    return {
      exported,
      pasted,
      problem,
      onExport: store.log.get.pipe(
        Effect.flatMap(Schema.encodeEffect(Store.LogText)),
        Effect.orDie,
        Effect.flatMap((text) => run(UiState.set(exported, text))),
      ),
      onPaste: (event: { readonly currentTarget: { readonly value: string } }) =>
        UiState.set(pasted, event.currentTarget.value),
      onLoad: pasted.get.pipe(
        Effect.flatMap(Schema.decodeEffect(Store.LogText)),
        Effect.flatMap(store.load),
        Effect.andThen(say("")),
        Effect.catch((unreadable) => say(unreadable.message)),
      ),
      name: store.key,
      position: Reactive.map(store.viewing, (viewing) =>
        viewing === null ? "live" : `action ${viewing}`,
      ),
      state: Reactive.map(store.state, (state) => Formatter.formatJson(state, { space: 2 })),
      changed,
      entries,
      onBack: step(store, before),
      onForward: step(store, after),
      onLive: store.travelTo(null),
    }
  }),
)(StoreView)

const summaryOfDead = (dead: Outbox.Dead): string =>
  `${dead.channel} ${Formatter.formatJson(dead.payload)}: ${dead.reason}`

const OutboxPanel = compose(
  withProps({ outbox: OutboxShown }),
  Effect.fnUntraced(function* ({ outbox }) {
    return {
      pending: outbox.pending,
      dead: yield* pipe(
        outbox.dead,
        Reactive.mapBy(
          (dead: Outbox.Dead) => dead.key,
          DeadView,
          (dead, key) => ({
            summary: Reactive.map(dead, summaryOfDead),
            onRetry: outbox.retry(key),
            onDiscard: outbox.discard(key),
          }),
        ),
      ),
    }
  }),
)(OutboxView)

export const Panel = compose(
  Effect.fnUntraced(function* () {
    const registry = yield* Registry
    const outbox = yield* Effect.serviceOption(Outbox.Outbox)
    const stores = yield* pipe(
      registry.stores,
      Reactive.mapBy(
        (store: Store.Inspected) => store.key,
        StorePanel,
        (inspected) => ({ inspected }),
      ),
    )

    return {
      stores,
      outbox: yield* Effect.forEach(Option.toArray(outbox), (service) =>
        View.child(OutboxPanel, { outbox: service }),
      ),
    }
  }),
)(PanelView)

const shortened = (text: string): string => (text.length > 80 ? `${text.slice(0, 79)}…` : text)

const detailOfMoment = (moment: Timeline.Moment): string => {
  if (moment.kind === "call") return ""
  if (moment.detail === null) return ""

  return shortened(Formatter.formatJson(moment.detail))
}

export const summaryOfMoment = (moment: Timeline.Moment): string =>
  `${moment.name} ${detailOfMoment(moment)}`.trim()

export const detailOfBranch = (branch: Branch): string =>
  branch.from === null
    ? `${branch.moments} moments`
    : `${branch.moments} moments, forked at ${branch.from}`

const neighbour = (
  seqs: ReadonlyArray<number>,
  viewing: number | null,
  by: number,
): number | null =>
  seqs.at(Math.max((viewing === null ? seqs.length : seqs.indexOf(viewing)) + by, 0)) ?? null

type Tick = typeof TickSchema.Type

export type Lane = { readonly slot: string; readonly ticks: ReadonlyArray<Tick> }

const slotOf = (moment: Timeline.Moment): string => {
  if (moment.kind === "route") return "router"
  if (moment.kind === "call") return "calls"
  if (moment.kind === "ui") return moment.name.replace(/ \. .*$/, "")

  const parts = moment.name.split("/")

  return parts.length > 1 ? parts.slice(0, -1).join("/") : moment.name
}

const fractionOf = (index: number, count: number): number =>
  count <= 1 ? 0.5 : index / (count - 1)

export const lanesOf = (moments: ReadonlyArray<Timeline.Moment>): ReadonlyArray<Lane> => {
  const ticked = moments.map((moment, index) => ({
    slot: slotOf(moment),
    tick: {
      seq: moment.seq,
      kind: moment.kind,
      at: `${(fractionOf(index, moments.length) * 100).toFixed(2)}%`,
    },
  }))

  return [...new Set(ticked.map((each) => each.slot))].map((slot) => ({
    slot,
    ticks: ticked.filter((each) => each.slot === slot).map((each) => each.tick),
  }))
}

const laneName = 180

const laneEnd = 12

export const acrossLanes = (
  moments: ReadonlyArray<Timeline.Moment>,
  seq: number | null,
): string => {
  const index =
    seq === null ? moments.length - 1 : moments.findIndex((moment) => moment.seq === seq)
  const fraction = fractionOf(Math.max(index, 0), moments.length)

  return `calc(${laneName}px + (100% - ${laneName + laneEnd}px) * ${fraction.toFixed(4)})`
}

type Surface = {
  readonly clientX: number
  readonly currentTarget: {
    readonly getBoundingClientRect: () => { readonly left: number; readonly width: number }
  }
}

export const seqAt = (moments: ReadonlyArray<Timeline.Moment>, event: Surface): number | null => {
  const box = event.currentTarget.getBoundingClientRect()
  const fraction =
    (event.clientX - box.left - laneName) / Math.max(box.width - laneName - laneEnd, 1)
  const index = Math.round(Math.min(Math.max(fraction, 0), 1) * Math.max(moments.length - 1, 0))

  return moments[index]?.seq ?? null
}

const tickColor: Readonly<Record<string, string>> = {
  command: "#6ea8fe",
  ui: "#c39bff",
  route: "#f0b45a",
  data: "#4fd1c5",
  call: "#8bd17c",
  noticed: "#ff8a94",
  refused: "#ff8a94",
  waited: "#f0b45a",
}

export const ticksDrawn = (ticks: ReadonlyArray<Tick>): string =>
  ticks
    .map((tick) => {
      const color = tickColor[tick.kind] ?? "#6ea8fe"

      return `linear-gradient(${color}, ${color}) calc(${tick.at} - 3px) 4px / 6px 10px no-repeat`
    })
    .join(", ")

export const LanesPanel = compose(
  withProps({
    shown: Props.Reactive(Schema.Boolean),
    scrubbed: Props.State(Schema.NullOr(Schema.Int)),
    onTrace: Props.Callback(Schema.String),
  }),
  Effect.fnUntraced(function* ({ shown, scrubbed, onTrace }) {
    const registry = yield* Registry
    const scrubbing = yield* UiState.make("scrubbing", Schema.Boolean, false)
    const viewed = yield* Reactive.zip(registry.moments, registry.viewing)
    const scrubbedAt = yield* Reactive.zip(registry.moments, scrubbed)
    const pointed = (event: Surface) =>
      Effect.map(registry.moments.get, (moments) => seqAt(moments, event))

    return {
      shown,
      scrubbing,
      marker: Reactive.map(viewed, ([moments, viewing]) => acrossLanes(moments, viewing)),
      scrubAt: Reactive.map(scrubbedAt, ([moments, seq]) => acrossLanes(moments, seq)),
      lanes: yield* pipe(
        Reactive.map(registry.moments, lanesOf),
        Reactive.mapBy(
          (lane: Lane) => lane.slot,
          LaneView,
          (lane, slot) => ({ slot, ticks: Reactive.map(lane, (now) => ticksDrawn(now.ticks)) }),
        ),
      ),
      onStart: (event: Surface) =>
        Effect.map(pointed(event), (seq) => [
          UiState.set(scrubbing, true),
          UiState.set(scrubbed, seq),
        ]),
      onScrub: Effect.fnUntraced(function* (event: Surface) {
        const dragging = yield* scrubbing.get
        if (!dragging) return

        const seq = yield* pointed(event)

        return UiState.set(scrubbed, seq)
      }),
      onLetGo: Effect.fnUntraced(function* (event: Surface) {
        const moments = yield* registry.moments.get
        const seq = seqAt(moments, event)
        const chosen = moments.filter((moment) => moment.seq === seq)

        return [
          UiState.set(scrubbing, false),
          UiState.set(scrubbed, null),
          ...chosen.map((moment) => registry.travelTo(moment.seq)),
          ...chosen
            .filter((moment) => moment.traceId !== "")
            .map((moment) => onTrace(moment.traceId)),
        ]
      }),
    }
  }),
)(LanesView)

const chosenMoment = (
  moments: ReadonlyArray<Timeline.Moment>,
  viewing: number | null,
): ReadonlyArray<Timeline.Moment> =>
  viewing === null ? moments.slice(-1) : moments.filter((moment) => moment.seq === viewing)

export const eventShown = (moments: ReadonlyArray<Timeline.Moment>, viewing: number | null) => {
  const found = chosenMoment(moments, viewing)

  return {
    heading: found.map((moment) => `#${moment.seq} ${moment.name}`).join("") || "No event yet",
    kind: found.map((moment) => moment.kind).join(""),
    detail: found
      .map((moment) =>
        moment.detail === null ? "" : Formatter.formatJson(moment.detail, { space: 2 }),
      )
      .join(""),
    traceId: found.map((moment) => moment.traceId).join(""),
    spanId: found.map((moment) => moment.spanId).join(""),
  }
}

export const EventPanel = compose(
  Effect.fnUntraced(function* () {
    const registry = yield* Registry
    const chosen = yield* Reactive.zip(registry.moments, registry.viewing)
    const shown = Reactive.map(chosen, ([moments, viewing]) => eventShown(moments, viewing))

    return {
      heading: Reactive.map(shown, (now) => now.heading),
      kind: Reactive.map(shown, (now) => now.kind),
      detail: Reactive.map(shown, (now) => now.detail),
      traceId: Reactive.map(shown, (now) => now.traceId),
      spanId: Reactive.map(shown, (now) => now.spanId),
      changes: Reactive.map(chosen, ([, viewing]) => changesText(registry.changesAt(viewing))),
    }
  }),
)(EventView)

export const changesText = (lines: ReadonlyArray<string>): string =>
  lines.length === 0 ? "Nothing in the state changed." : lines.join("\n")

export const TimelinePanel = compose(
  withProps({
    onTrace: Props.Callback(Schema.String),
    scrubbed: Props.Reactive(Schema.NullOr(Schema.Int)),
  }),
  Effect.fnUntraced(function* ({ onTrace, scrubbed }) {
    const registry = yield* Registry

    return {
      moments: yield* pipe(
        registry.moments,
        Reactive.mapBy(
          (moment: Timeline.Moment) => String(moment.seq),
          MomentView,
          (moment, seq) => ({
            seq,
            kind: Reactive.map(moment, (now) => now.kind),
            summary: Reactive.map(moment, summaryOfMoment),
            trace: Reactive.map(moment, (now) => now.traceId),
            current: Reactive.map(registry.viewing, (viewing) => String(viewing) === seq),
            scrubbed: Reactive.map(scrubbed, (at) => String(at) === seq),
            onJump: registry.travelTo(Number(seq)),
            onTrace: Effect.flatMap(moment.get, (now) => run(onTrace(now.traceId))),
          }),
        ),
      ),
    }
  }),
)(TimelineView)

export const TravelPanel = compose(
  withProps({ onTrace: Props.Callback(Schema.String) }),
  Effect.fnUntraced(function* ({ onTrace }) {
    const registry = yield* Registry
    const stepped = Effect.fnUntraced(function* (by: -1 | 1) {
      yield* registry.step(by)

      const moments = yield* registry.moments.get
      const viewing = yield* registry.viewing.get
      const traces = moments
        .filter((moment) => moment.seq === viewing && moment.traceId !== "")
        .map((moment) => moment.traceId)

      yield* Effect.forEach(traces, (traceId) => run(onTrace(traceId)), { discard: true })
    })

    return {
      position: Reactive.map(registry.viewing, (viewing) =>
        viewing === null ? "Now" : `At ${viewing}`,
      ),
      live: Reactive.map(registry.viewing, (viewing) => viewing === null),
      branches: yield* pipe(
        registry.branches,
        Reactive.mapBy(
          (branch: Branch) => String(branch.id),
          BranchView,
          (branch, id) => ({
            name: Reactive.map(branch, (now) => now.name),
            detail: Reactive.map(branch, detailOfBranch),
            current: Reactive.map(branch, (now) => now.current),
            onSwitch: registry.switchTo(Number(id)),
          }),
        ),
      ),
      onBack: stepped(-1),
      onForward: stepped(1),
      onLive: registry.travelTo(null),
      onFork: registry.fork,
    }
  }),
)(TravelView)

export const Component = Schema.Struct({
  name: Schema.String,
  place: Schema.String,
  services: Schema.Array(Schema.String),
  recovers: Schema.Array(Schema.String),
  props: Schema.Record(Schema.String, Schema.Json),
  state: Schema.Record(Schema.String, Schema.Json),
})

export type Component = typeof Component.Type

const componentOf = (seen: Seen, placed: Placed, snapshot: UiState.Snapshot): Component => ({
  name: seen.name,
  place: placed.path.join(" / "),
  services: placed.services,
  recovers: seen.recovers,
  props: Shown.allShown(seen.fields, seen.props),
  state: Object.fromEntries(
    snapshot
      .filter((entry) => samePath(entry.path, placed.path))
      .map((entry) => [entry.name, entry.value] as const),
  ),
})

export const components = (snapshot: UiState.Snapshot): ReadonlyArray<Component> =>
  Option.toArray(inspecting.read()).flatMap((inspector) =>
    [...inspector.seen.values()].flatMap((seen) =>
      Option.toArray(seen.placed).map((placed) => componentOf(seen, placed, snapshot)),
    ),
  )

export const startInspecting = (): void => inspecting.write(Option.some(new Inspecting()))

export const stopInspecting = (): void => inspecting.write(Option.none())

type Fact = { readonly name: string; readonly value: string; readonly from: string }

type Details = {
  readonly id: number
  readonly name: string
  readonly place: string
  readonly services: string
  readonly props: ReadonlyArray<Fact>
  readonly state: ReadonlyArray<Fact>
  readonly recovers: string
  readonly when: string
}

type Changed = Fact & { readonly key: string; readonly from: string; readonly when: string }

const factsOf = (
  shown: Readonly<Record<string, Schema.Json>>,
  given: unknown,
): ReadonlyArray<Fact> =>
  Object.entries(shown).map(([name, value]) => ({
    name,
    value: Formatter.formatJson(value),
    from: Option.getOrElse(sourceOf(Reflect.get(Object(given), name)), () => ""),
  }))

const samePath = (left: UiState.Path, right: UiState.Path): boolean =>
  left.length === right.length && left.every((part, index) => part === right[index])

const stateAt = (path: UiState.Path, snapshot: UiState.Snapshot): ReadonlyArray<Fact> =>
  snapshot
    .filter((entry) => samePath(entry.path, path))
    .map((entry) => ({ name: entry.name, value: Formatter.formatJson(entry.value), from: "" }))

const whenOf = (moments: ReadonlyArray<Timeline.Moment>): string =>
  Option.match(Array.last(moments), {
    onNone: () => "at the start",
    onSome: (moment) => `after ${moment.seq}: ${moment.kind} ${moment.name}`,
  })

const detailsOf = (
  seen: Seen,
  snapshot: UiState.Snapshot,
  moments: ReadonlyArray<Timeline.Moment>,
): Details => ({
  id: seen.id,
  name: seen.name,
  place: Option.match(seen.placed, {
    onNone: () => "A view drawn by its parent",
    onSome: (placed) => placed.path.join(" / "),
  }),
  services: Option.match(seen.placed, {
    onNone: () => "None: a view cannot reach a service",
    onSome: (placed) => placed.services.join(", "),
  }),
  props: factsOf(Shown.allShown(seen.fields, seen.props), seen.props),
  recovers: seen.recovers.join(". "),
  state: Option.match(seen.placed, {
    onNone: () => [],
    onSome: (placed) => stateAt(placed.path, snapshot),
  }),
  when: whenOf(moments),
})

const labelled = (kind: string, facts: ReadonlyArray<Fact>): ReadonlyArray<Fact> =>
  facts.map((fact) => ({ ...fact, name: `${kind} ${fact.name}` }))

const allFacts = (details: Details): ReadonlyArray<Fact> => [
  ...labelled("prop", details.props),
  ...labelled("state", details.state),
]

const changesBetween = (was: Details, now: Details): ReadonlyArray<Changed> => {
  const earlier = new Map(allFacts(was).map((fact) => [fact.name, fact.value]))

  return allFacts(now).flatMap((fact) =>
    Option.toArray(
      Option.filter(
        Option.fromUndefinedOr(earlier.get(fact.name)),
        (value) => value !== fact.value,
      ),
    ).map((from) => ({ ...fact, key: `${now.when} ${fact.name}`, from, when: now.when })),
  )
}

const followed = (
  history: ReadonlyArray<Changed>,
  was: Option.Option<Details>,
  now: Option.Option<Details>,
): ReadonlyArray<Changed> =>
  Option.match(Option.all([was, now]), {
    onNone: () => [],
    onSome: ([earlier, later]) =>
      earlier.id === later.id ? [...history, ...changesBetween(earlier, later)].slice(-50) : [],
  })

const seenAs = (id: number | null): Option.Option<Seen> =>
  Option.flatMap(Option.all([inspecting.read(), Option.fromNullOr(id)]), ([inspector, found]) =>
    inspector.find(found),
  )

const outside = "[data-spar-devtools]"

const px = (size: number): string => `${size}px`

const Veil = compose(
  withProps({ onMove: Props.Handler("pointermove"), onPick: Props.Handler("click") }),
)(VeilView)

type Outlined = { readonly name: string; readonly box: Dom.Box }

const Outline = pipe(compose(withProps(OutlineView.props))(OutlineView), View.portal)

const facts = (rows: Reactive.Reactive<ReadonlyArray<Fact>>) =>
  pipe(
    rows,
    Reactive.mapBy(
      (fact: Fact) => fact.name,
      FactView,
      (fact) => ({
        name: Reactive.map(fact, (now) => now.name),
        value: Reactive.map(fact, (now) => now.value),
        from: Reactive.map(fact, (now) => now.from),
      }),
    ),
  )

export const Inspector = compose(
  Effect.fnUntraced(function* () {
    const registry = yield* Registry
    const picking = yield* UiState.make("picking", Schema.Boolean, false)
    const hovered = yield* UiState.make("hovered", Schema.NullOr(Schema.Int), null)
    const picked = yield* UiState.make("picked", Schema.NullOr(Schema.Int), null)
    const chosen = yield* Reactive.zip(picked, hovered)
    const watched = yield* Reactive.zip(chosen, registry.moments)
    const history = Cell.make<ReadonlyArray<Changed>>([])
    const current = Cell.make(Option.none<Details>())
    const details = fromCell(current)

    yield* observed(watched, ([[pickedId], moments]) => {
      const now = Option.map(seenAs(pickedId), (seen) =>
        detailsOf(seen, registry.uiState(), moments),
      )

      history.write(followed(history.read(), current.read(), now))
      current.write(now)
    })
    const shown = Reactive.map(watched, ([[pickedId, hoveredId]]) => hoveredId ?? pickedId)
    const outlined = Reactive.map(shown, (id): ReadonlyArray<Outlined> =>
      Option.toArray(
        Option.flatMap(seenAs(id), (seen) =>
          Option.map(Option.fromNullOr(Dom.boxAround(mark, seen.id)), (box) => ({
            name: seen.name,
            box,
          })),
        ),
      ),
    )
    const about = <A>(pick: (found: Details) => A, otherwise: A) =>
      Reactive.map(details, (found) =>
        Option.match(found, { onNone: () => otherwise, onSome: pick }),
      )

    yield* Events.onDocument("keydown", (event) =>
      event.key === "Escape" ? [UiState.set(picking, false), UiState.set(hovered, null)] : [],
    )

    return {
      picking,
      name: about((found) => found.name, "Nothing picked yet"),
      place: about((found) => found.place, ""),
      services: about((found) => found.services, ""),
      recovers: about((found) => found.recovers, ""),
      props: yield* facts(about((found) => found.props, [])),
      state: yield* facts(about((found) => found.state, [])),
      changes: yield* pipe(
        fromCell(history),
        Reactive.mapBy(
          (change: Changed) => change.key,
          ChangeView,
          (change) => ({
            what: Reactive.map(change, (now) => now.name),
            from: Reactive.map(change, (now) => now.from),
            to: Reactive.map(change, (now) => now.value),
            when: Reactive.map(change, (now) => now.when),
          }),
        ),
      ),
      veil: yield* pipe(
        picking,
        Reactive.when(Veil, {
          onMove: (event) =>
            UiState.set(hovered, Dom.markedAt(event.clientX, event.clientY, mark, outside)),
          onPick: (event) => [
            UiState.set(picked, Dom.markedAt(event.clientX, event.clientY, mark, outside)),
            UiState.set(hovered, null),
            UiState.set(picking, false),
          ],
        }),
      ),
      outline: yield* pipe(
        outlined,
        Reactive.mapBy(
          () => "outline",
          Outline,
          (found) => ({
            name: Reactive.map(found, (now) => now.name),
            left: Reactive.map(found, (now) => px(now.box.x)),
            top: Reactive.map(found, (now) => px(now.box.y)),
            width: Reactive.map(found, (now) => px(now.box.width)),
            height: Reactive.map(found, (now) => px(now.box.height)),
          }),
        ),
      ),
      onPick: UiState.update(picking, (on) => !on),
    }
  }),
)(InspectorView)

type Sided = { readonly span: Spans.Recorded; readonly where: "page" | "backend" }

type Bar = {
  readonly key: string
  readonly name: string
  readonly where: string
  readonly took: string
  readonly failed: boolean
  readonly indent: string
  readonly left: string
  readonly width: string
  readonly note: string
  readonly waitedFrom: string
  readonly waited: string
  readonly about: string
}

const endOf = (span: Spans.Recorded): number => span.endedAt ?? span.startedAt

const depthOf = (
  span: Spans.Recorded,
  byId: ReadonlyMap<string, Spans.Recorded>,
  seen: number,
): number =>
  Option.match(Option.fromUndefinedOr(byId.get(span.parentSpanId ?? "")), {
    onNone: () => seen,
    onSome: (parent) => depthOf(parent, byId, seen + 1),
  })

const percent = (part: number, whole: number): string => `${((part / whole) * 100).toFixed(2)}%`

const waitedFor = (source: string): string => (source === "" ? "" : `input from ${source}`)

const noteOf = (attributes: Readonly<Record<string, string>>): string => {
  const from = attributes["spar.query.served_from"]
  const view = attributes["spar.view"]
  if (view !== undefined) return `in ${view}`
  if (from === undefined) return waitedFor(attributes["spar.query.after"] ?? "")

  return from === ""
    ? "served from what was loaded"
    : `served from what trace ${from.slice(0, 8)} loaded`
}

const askedBefore = (
  span: Spans.Recorded,
  ordered: ReadonlyArray<Sided>,
): Spans.Recorded | undefined =>
  Spans.sourceOf(
    span,
    ordered.map((each) => each.span),
  )

const noticeableWait = 20

export const waitBefore = (span: Spans.Recorded, all: ReadonlyArray<Sided>): string => {
  const ended = all
    .map((each) => each.span)
    .filter((other) => other.parentSpanId === span.parentSpanId && other.spanId !== span.spanId)
    .map(endOf)
    .filter((end) => end <= span.startedAt)
  const gap = Math.min(...ended.map((end) => span.startedAt - end))

  return Number.isFinite(gap) && gap >= noticeableWait ? `after a ${gap.toFixed(0)} ms wait` : ""
}

export const backgroundOf = (attributes: Readonly<Record<string, string>>): string =>
  attributes["spar.background"] === "outbox"
    ? "in the background: the click was done when it was saved"
    : ""

const notesOf = (span: Spans.Recorded, all: ReadonlyArray<Sided>): string =>
  [backgroundOf(span.attributes), noteOf(span.attributes), waitBefore(span, all)]
    .filter((note) => note !== "")
    .join(" · ")

export const barsOf = (sided: ReadonlyArray<Sided>): ReadonlyArray<Bar> => {
  const ordered = sided.toSorted((left, right) => left.span.startedAt - right.span.startedAt)
  const byId = new Map(ordered.map((each) => [each.span.spanId, each.span]))
  const start = Math.min(...ordered.map((each) => each.span.startedAt))
  const whole = Math.max(Math.max(...ordered.map((each) => endOf(each.span))) - start, 1)

  return ordered.map(({ span, where }) => ({
    key: `${where} ${span.spanId}`,
    name: span.name,
    where,
    took: `${(endOf(span) - span.startedAt).toFixed(1)} ms`,
    failed: span.failed,
    indent: px(depthOf(span, byId, 0) * 12),
    left: percent(span.startedAt - start, whole),
    width: percent(endOf(span) - span.startedAt, whole),
    note: notesOf(span, ordered),
    waitedFrom: percent((askedBefore(span, ordered)?.startedAt ?? span.startedAt) - start, whole),
    waited: percent(
      span.startedAt - (askedBefore(span, ordered)?.startedAt ?? span.startedAt),
      whole,
    ),
    about: aboutSpan(span, where),
  }))
}

export const aboutSpan = (span: Spans.Recorded, where: string): string =>
  [
    span.name,
    `${where} · ${(endOf(span) - span.startedAt).toFixed(1)} ms${span.failed ? " · failed" : ""}`,
    `span    ${span.spanId}`,
    `parent  ${span.parentSpanId ?? "none, it starts the trace"}`,
    `trace   ${span.traceId}`,
    "",
    ...Object.entries(span.attributes).map(([name, value]) => `${name}  ${value}`),
  ].join("\n")

const backendCount = (): number =>
  Option.getOrElse(
    Schema.decodeUnknownOption(Schema.Int)(Reflect.get(globalThis, "sparBackends")),
    () => 0,
  )

const fromBackend = (index: number, traceId: string, ask: number) =>
  HttpClient.get(`${location.origin}${backendPath(index)}/spans/${traceId}?ask=${ask}`).pipe(
    Effect.flatMap((answer) => answer.json),
    Effect.map((found) => Option.getOrElse(decodeSpans(found), () => [])),
    Effect.orElseSucceed((): ReadonlyArray<Spans.Recorded> => []),
  )

const fromBackends = (traceId: string, ask: number) =>
  Effect.map(
    Effect.forEach(Array.range(0, backendCount() - 1).slice(0, backendCount()), (index) =>
      fromBackend(index, traceId, ask),
    ),
    (found) => found.flat(),
  ).pipe(Effect.provide(FetchHttpClient.layer))

const decodeSpans = Schema.decodeUnknownOption(Schema.Array(Spans.Recorded))

export const TracePanel = compose(
  withProps({ traceId: Props.Reactive(Schema.String), onSpan: Props.Callback(Schema.String) }),
  Effect.fnUntraced(function* ({ traceId, onSpan }) {
    const registry = yield* Registry
    const page = yield* Effect.serviceOption(Spans.SpanBuffer)
    const backend = Cell.make<ReadonlyArray<Spans.Recorded>>([])
    const asks = Cell.make(0)
    const asked = (id: string) =>
      Effect.suspend(() => {
        asks.write(asks.read() + 1)

        return Effect.map(fromBackends(id, asks.read()), (found) => backend.write(found))
      })
    const start = yield* starter()
    const lens = yield* UiState.make("lens", Schema.String, "all")
    const watched = yield* Reactive.zip(traceId, registry.moments)
    const fetched = yield* Reactive.zip(watched, fromCell(backend))
    const shown = yield* Reactive.zip(fetched, lens)
    const bars = Reactive.map(shown, ([[[id], found], through]) =>
      barsOf(
        [
          ...Option.toArray(page).flatMap((buffer) =>
            buffer.ofTrace(id).map((span): Sided => ({ span, where: "page" })),
          ),
          ...found
            .filter((span) => span.traceId === id)
            .map((span): Sided => ({ span, where: "backend" })),
        ].filter((each) => Spans.inLens(through, each.span, each.where)),
      ),
    )

    yield* observed(traceId, (id) => start(asked(id)))

    const chains = Reactive.map(shown, ([[[id]]]) =>
      Spans.chainsOf(Option.toArray(page).flatMap((buffer) => buffer.ofTrace(id)))
        .map(Spans.chainText)
        .join("\n\n"),
    )

    return {
      traceId,
      chains,
      summary: Reactive.map(bars, (all) =>
        all.length === 0 ? "No trace picked yet" : `${all.length} spans`,
      ),
      bars: yield* pipe(
        bars,
        Reactive.mapBy(
          (bar: Bar) => bar.key,
          BarView,
          (bar) => ({
            name: Reactive.map(bar, (now) => now.name),
            where: Reactive.map(bar, (now) => now.where),
            took: Reactive.map(bar, (now) => now.took),
            failed: Reactive.map(bar, (now) => now.failed),
            indent: Reactive.map(bar, (now) => now.indent),
            left: Reactive.map(bar, (now) => now.left),
            width: Reactive.map(bar, (now) => now.width),
            waitedFrom: Reactive.map(bar, (now) => now.waitedFrom),
            waited: Reactive.map(bar, (now) => now.waited),
            note: Reactive.map(bar, (now) => now.note),
            onSelect: Effect.map(bar.get, (now) => onSpan(now.about)),
          }),
        ),
      ),
      onRefresh: Effect.flatMap(traceId.get, asked),
      lens,
      onLens: (name: string) => UiState.set(lens, name),
    }
  }),
)(TraceView)

export const Tools = compose(
  Effect.fnUntraced(function* () {
    const tracing = yield* UiState.make("tracing", Schema.String, "")
    const scrubbed = yield* UiState.make("scrubbed", Schema.NullOr(Schema.Int), null)
    const lanesShown = yield* UiState.make("lanes", Schema.Boolean, true)
    const onTrace = (traceId: string) => UiState.set(tracing, traceId)
    const detailTab = yield* UiState.make("detail", Schema.String, "event")
    const spanAbout = yield* UiState.make("span", Schema.String, "")
    const onSpan = (about: string) => [
      UiState.set(spanAbout, about),
      UiState.set(detailTab, "span"),
    ]

    return {
      open: yield* UiState.make("open", Schema.Boolean, false),
      lanesShown,
      detailTab,
      spanAbout,
      event: yield* View.child(EventPanel, {}),
      inspector: yield* View.child(Inspector, {}),
      lanes: yield* View.child(LanesPanel, { shown: lanesShown, scrubbed, onTrace }),
      travel: yield* View.child(TravelPanel, { onTrace }),
      timeline: yield* View.child(TimelinePanel, { onTrace, scrubbed }),
      trace: yield* View.child(TracePanel, { traceId: tracing, onSpan }),
      stores: yield* View.child(Panel, {}),
    }
  }),
)(ToolsView)
