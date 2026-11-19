import {
  Array,
  Context,
  Effect,
  Formatter,
  Layer,
  Option,
  Predicate,
  Record,
  Schema,
  pipe,
} from "effect"
import { run } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell, observed } from "./internal/reactive.ts"
import {
  ChangeView,
  DeadView,
  EntryView,
  FactView,
  InspectorView,
  MomentView,
  OutboxView,
  OutlineView,
  PanelView,
  StoreView,
  TimelineView,
  ToolsView,
  VeilView,
} from "./devtools/PanelView.tsx"
import * as Events from "./Events.ts"
import * as Dom from "./internal/dom.ts"
import { inspecting, mark } from "./internal/inspect.ts"
import type { Seen } from "./internal/inspect.ts"
import * as Outbox from "./Outbox.ts"
import * as Reactive from "./Reactive.ts"
import * as Store from "./Store.ts"
import * as Timeline from "./Timeline.ts"
import * as Props from "./Props.ts"
import * as UiState from "./UiState.ts"
import * as View from "./View.ts"

type OutboxService = Context.Service.Shape<typeof Outbox.Outbox>

export const InspectedStore = Props.kind(
  (value): value is Store.Inspected => Predicate.hasProperty(value, "travelTo"),
  Props.named("store"),
)

export const OutboxShown = Props.kind(
  (value): value is OutboxService => Predicate.hasProperty(value, "persist"),
  Props.named("outbox"),
)

export class Registry extends Context.Service<
  Registry,
  {
    readonly stores: Reactive.Reactive<ReadonlyArray<Store.Inspected>>
    readonly moments: Reactive.Reactive<ReadonlyArray<Timeline.Moment>>
    readonly viewing: Reactive.Reactive<number | null>
    readonly travelTo: (seq: number | null) => Effect.Effect<void>
    readonly uiState: () => UiState.Snapshot
    readonly follow: (tree: ReturnType<typeof UiState.makeTree>) => void
  }
>()("spar/Devtools/Registry") {}

type Remembered = {
  readonly moment: Timeline.Moment
  readonly ui: UiState.Snapshot
  readonly stores: Readonly<Record<string, number>>
}

type Past = {
  readonly remembered: ReadonlyArray<Remembered>
  readonly viewing: number | null
  readonly live: UiState.Snapshot
}

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
    const first = yield* UiState.Tree
    const trees = Cell.make(first)
    const stores = Cell.make<ReadonlyArray<Store.Inspected>>([])
    const past = Cell.make<Past>({ remembered: [], viewing: null, live: [] })

    const record = Effect.fnUntraced(function* (noted: Timeline.Noted) {
      const tree = yield* UiState.Tree
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
          { moment: { ...noted, seq }, ui: tree.snapshot(), stores: Object.fromEntries(reached) },
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
      const live = before.viewing === null ? trees.read().snapshot() : before.live
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

    return Context.make(Registry, {
      stores: fromCell(stores),
      moments: Reactive.map(fromCell(past), (now) => now.remembered.map((kept) => kept.moment)),
      viewing: Reactive.map(fromCell(past), (now) => now.viewing),
      travelTo,
      uiState: () => trees.read().snapshot(),
      follow: (tree) => trees.write(tree),
    }).pipe(
      Context.add(Store.Inspector, {
        keepStates: 1000,
        register: (store) => Effect.sync(() => stores.write([...stores.read(), store])),
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

const StorePanel = View.taking(
  { inspected: Props.Reactive(InspectedStore) },
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
      entries,
      onBack: step(store, before),
      onForward: step(store, after),
      onLive: store.travelTo(null),
    }
  }),
)(StoreView)

const summaryOfDead = (dead: Outbox.Dead): string =>
  `${dead.channel} ${Formatter.formatJson(dead.payload)}: ${dead.reason}`

const OutboxPanel = View.taking(
  { outbox: OutboxShown },
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

export const Panel = View.connect(
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

const summaryOfMoment = (moment: Timeline.Moment): string =>
  `${moment.kind} ${moment.name} ${Formatter.formatJson(moment.detail)}`

const neighbour = (
  seqs: ReadonlyArray<number>,
  viewing: number | null,
  by: number,
): number | null =>
  seqs.at(Math.max((viewing === null ? seqs.length : seqs.indexOf(viewing)) + by, 0)) ?? null

export const TimelinePanel = View.connect(
  Effect.fnUntraced(function* () {
    const registry = yield* Registry
    const stepped = Effect.fnUntraced(function* (by: number) {
      const moments = yield* registry.moments.get
      const viewing = yield* registry.viewing.get

      yield* registry.travelTo(
        neighbour(
          moments.map((moment) => moment.seq),
          viewing,
          by,
        ),
      )
    })

    return {
      position: Reactive.map(registry.viewing, (viewing) =>
        viewing === null ? "Now" : `At ${viewing}`,
      ),
      moments: yield* pipe(
        registry.moments,
        Reactive.mapBy(
          (moment: Timeline.Moment) => String(moment.seq),
          MomentView,
          (moment, seq) => ({
            seq,
            summary: Reactive.map(moment, summaryOfMoment),
            trace: Reactive.map(moment, (now) => now.traceId),
            current: Reactive.map(registry.viewing, (viewing) => String(viewing) === seq),
            onJump: registry.travelTo(Number(seq)),
          }),
        ),
      ),
      onBack: stepped(-1),
      onForward: stepped(1),
      onLive: registry.travelTo(null),
    }
  }),
)(TimelineView)

type Fact = { readonly name: string; readonly value: string }

type Details = {
  readonly id: number
  readonly name: string
  readonly place: string
  readonly services: string
  readonly props: ReadonlyArray<Fact>
  readonly state: ReadonlyArray<Fact>
  readonly when: string
}

type Changed = Fact & { readonly key: string; readonly from: string; readonly when: string }

const factsOf = (shown: Readonly<Record<string, Schema.Json>>): ReadonlyArray<Fact> =>
  Object.entries(shown).map(([name, value]) => ({ name, value: Formatter.formatJson(value) }))

const samePath = (left: UiState.Path, right: UiState.Path): boolean =>
  left.length === right.length && left.every((part, index) => part === right[index])

const stateAt = (path: UiState.Path, snapshot: UiState.Snapshot): ReadonlyArray<Fact> =>
  snapshot
    .filter((entry) => samePath(entry.path, path))
    .map((entry) => ({ name: entry.name, value: Formatter.formatJson(entry.value) }))

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
  props: factsOf(Props.allShown(seen.fields, seen.props)),
  state: Option.match(seen.placed, {
    onNone: () => [],
    onSome: (placed) => stateAt(placed.path, snapshot),
  }),
  when: whenOf(moments),
})

const labelled = (kind: string, facts: ReadonlyArray<Fact>): ReadonlyArray<Fact> =>
  facts.map((fact) => ({ name: `${kind} ${fact.name}`, value: fact.value }))

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

const Veil = View.taking(
  { onMove: Props.Handler("pointermove"), onPick: Props.Handler("click") },
  (handlers) => Effect.succeed(handlers),
)(VeilView)

type Outlined = { readonly name: string; readonly box: Dom.Box }

const Outline = pipe(
  View.taking(OutlineView.props, (box) => Effect.succeed(box))(OutlineView),
  View.portal,
)

const facts = (rows: Reactive.Reactive<ReadonlyArray<Fact>>) =>
  pipe(
    rows,
    Reactive.mapBy(
      (fact: Fact) => fact.name,
      FactView,
      (fact) => ({
        name: Reactive.map(fact, (now) => now.name),
        value: Reactive.map(fact, (now) => now.value),
      }),
    ),
  )

export const Inspector = View.connect(
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

export const Tools = View.connect(
  Effect.fnUntraced(function* () {
    return {
      open: yield* UiState.make("open", Schema.Boolean, false),
      inspector: yield* View.child(Inspector, {}),
      timeline: yield* View.child(TimelinePanel, {}),
      stores: yield* View.child(Panel, {}),
    }
  }),
)(ToolsView)
