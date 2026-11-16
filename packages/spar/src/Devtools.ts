import { Context, Effect, Formatter, Layer, pipe } from "effect"
import * as Cell from "./internal/cell.ts"
import { fromCell } from "./internal/reactive.ts"
import { EntryView, PanelView, StoreView } from "./devtools/PanelView.tsx"
import * as Reactive from "./Reactive.ts"
import * as Store from "./Store.ts"
import * as View from "./View.ts"

export class Registry extends Context.Service<
  Registry,
  { readonly stores: Reactive.Reactive<ReadonlyArray<Store.Inspected>> }
>()("spar/Devtools/Registry") {}

export const layer: Layer.Layer<Registry> = Layer.effectContext(
  Effect.sync(() => {
    const stores = Cell.make<ReadonlyArray<Store.Inspected>>([])

    return Context.make(Registry, { stores: fromCell(stores) }).pipe(
      Context.add(Store.Inspector, {
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

    return {
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

export const Panel = View.connect(
  Effect.fnUntraced(function* () {
    const registry = yield* Registry
    const stores = yield* pipe(
      registry.stores,
      Reactive.mapBy(
        (store: Store.Inspected) => store.key,
        StorePanel,
        (inspected) => ({ inspected }),
      ),
    )

    return { stores }
  }),
)(PanelView)
