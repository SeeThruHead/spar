import { Effect, Formatter, Function, Layer, Option, Schedule, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import type { Store } from "spar"
import { PageRpcs } from "./protocol.ts"
import type { Ask, Command, Snapshot } from "./protocol.ts"

const snapshotOf = (store: Store.Inspected): Effect.Effect<Snapshot> =>
  Effect.all({
    store: Effect.succeed(store.key),
    state: Effect.map(store.state.get, (state) => Formatter.formatJson(state, { space: 2 })),
    log: store.log.get,
    actions: Effect.sync(store.actions),
    viewing: store.viewing.get,
  })

const changesOf = (store: Store.Inspected): Stream.Stream<void> =>
  Stream.mergeAll([store.state.changes, store.log.changes, store.viewing.changes], {
    concurrency: "unbounded",
  }).pipe(Stream.map(Function.constVoid))

type OfStore = Extract<Ask, { readonly store: string }>

const done = (
  store: Store.Inspected,
  ask: OfStore,
): Effect.Effect<void, { readonly message: string }> => {
  if (ask._tag === "TravelTo") return store.travelTo(ask.seq)
  if (ask._tag === "Run") return store.run(ask.action, ask.payload)

  return store.load(ask.entries)
}

const refused = (name: string) => ({
  message: `There is no UI state called ${name} there, or the value does not fit its Schema.`,
})

const Located = Schema.Struct({ href: Schema.String })

const keptUp = <A, E, R>(what: string, work: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  work.pipe(
    Effect.tapError((cause) => Effect.logDebug(`The devtools link stopped ${what}`, cause)),
    Effect.retry(Schedule.spaced("2 seconds")),
  )

const link = Effect.gen(function* () {
  const registry = yield* Devtools.Registry
  const server = yield* RpcClient.make(PageRpcs)
  const spans = yield* Effect.serviceOption(Spans.SpanBuffer)
  const random = yield* SecureRandom.SecureRandom
  const pageId = yield* random.uuidV7()
  const address = Option.getOrElse(
    Option.map(
      Schema.decodeOption(Located)(Reflect.get(globalThis, "location")),
      (found) => found.href,
    ),
    () => "",
  )
  const report = Effect.gen(function* () {
    const stores = yield* Effect.flatMap(registry.stores.get, Effect.forEach(snapshotOf))
    const ui = registry.uiState()

    yield* server.Report({
      page: {
        id: pageId,
        address,
        stores,
        ui,
        moments: yield* registry.moments.get,
        viewing: yield* registry.viewing.get,
        branches: yield* registry.branches.get,
        components: Devtools.components(ui).slice(-200),
        spans: Option.toArray(spans).flatMap((buffer) => buffer.recent().slice(-500)),
      },
    })
  })
  const onStore = (ask: OfStore) =>
    Effect.flatMap(registry.stores.get, (stores) =>
      Effect.fromNullishOr(stores.find((each) => each.key === ask.store)).pipe(
        Effect.mapError(() => ({ message: `There is no store called ${ask.store}.` })),
        Effect.flatMap((store) => done(store, ask)),
      ),
    )
  const carried = (ask: Ask): Effect.Effect<void, { readonly message: string }> => {
    if (ask._tag === "Rewind") return registry.travelTo(ask.seq)
    if (ask._tag === "Fork") return registry.fork
    if (ask._tag === "SwitchTo") return registry.switchTo(ask.branch)
    if (ask._tag === "Step") return registry.step(ask.by)
    if (ask._tag !== "SetUi") return onStore(ask)

    return registry.setUi(ask.path, ask.name, ask.value)
      ? Effect.void
      : Effect.fail(refused(ask.name))
  }

  const carryOut = Effect.fnUntraced(function* ({ id, ask }: Command) {
    const problem = yield* carried(ask).pipe(
      Effect.as(null),
      Effect.catch((failed) => Effect.succeed(failed.message)),
    )

    yield* report
    yield* server.Outcome({ id, problem })
  })

  const reporting = registry.stores.changes.pipe(
    Stream.switchMap((stores) =>
      Stream.mergeAll(
        [
          ...stores.map(changesOf),
          Stream.map(registry.moments.changes, Function.constVoid),
          Stream.map(registry.viewing.changes, Function.constVoid),
          Stream.map(registry.branches.changes, Function.constVoid),
        ],
        { concurrency: "unbounded" },
      ),
    ),
    Stream.debounce("20 millis"),
    Stream.runForEach(() => report),
  )

  yield* Effect.forkScoped(keptUp("reporting", reporting), { startImmediately: true })
  yield* Effect.forkScoped(
    keptUp("taking commands", Stream.runForEach(server.Commands({ page: pageId }), carryOut)),
    { startImmediately: true },
  )
})

export const layer = (options: {
  readonly url: string
}): Layer.Layer<never, never, Devtools.Registry> =>
  Layer.effectDiscard(link).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: `${options.url}/page` })),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(SecureRandom.layerWebCrypto),
  )
