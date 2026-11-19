import { Context, Effect, Formatter, Layer, Option, Schema, pipe } from "effect"
import { run } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell } from "./internal/reactive.ts"
import { DeadView, EntryView, OutboxView, PanelView, StoreView } from "./devtools/PanelView.tsx"
import * as Outbox from "./Outbox.ts"
import * as Reactive from "./Reactive.ts"
import * as Store from "./Store.ts"
import * as UiState from "./UiState.ts"
import * as View from "./View.ts"

type OutboxService = Context.Service.Shape<typeof Outbox.Outbox>

export class Registry extends Context.Service<
  Registry,
  { readonly stores: Reactive.Reactive<ReadonlyArray<Store.Inspected>> }
>()("spar/Devtools/Registry") {}

export const layer: Layer.Layer<Registry> = Layer.effectContext(
  Effect.sync(() => {
    const stores = Cell.make<ReadonlyArray<Store.Inspected>>([])

    return Context.make(Registry, { stores: fromCell(stores) }).pipe(
      Context.add(Store.Inspector, {
        keepStates: 1000,
        register: (store) => Effect.sync(() => stores.write([...stores.read(), store])),
      }),
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

const StorePanel = View.connect(
  Effect.fnUntraced(function* (props: { readonly inspected: Reactive.Reactive<Store.Inspected> }) {
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

const OutboxPanel = View.connect(
  Effect.fnUntraced(function* ({ outbox }: { readonly outbox: OutboxService }) {
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
