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
import { fromCell } from "./internal/reactive.ts"
import {
  DeadView,
  EntryView,
  MomentView,
  OutboxView,
  PanelView,
  StoreView,
  TimelineView,
  ToolsView,
} from "./devtools/PanelView.tsx"
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

export const Tools = View.connect(
  Effect.fnUntraced(function* () {
    return {
      open: yield* UiState.make("open", Schema.Boolean, false),
      timeline: yield* View.child(TimelinePanel, {}),
      stores: yield* View.child(Panel, {}),
    }
  }),
)(ToolsView)
