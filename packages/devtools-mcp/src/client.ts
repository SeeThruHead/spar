import { Effect, Formatter, Function, Layer, Schedule, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Devtools } from "spar"
import type { Store } from "spar"
import { PageRpcs } from "./protocol.ts"
import type { Ask, Command, Snapshot } from "./protocol.ts"

const snapshotOf = (store: Store.Inspected): Effect.Effect<Snapshot> =>
  Effect.all({
    store: Effect.succeed(store.key),
    state: Effect.map(store.state.get, (state) => Formatter.formatJson(state, { space: 2 })),
    log: store.log.get,
    viewing: store.viewing.get,
  })

const changesOf = (store: Store.Inspected): Stream.Stream<void> =>
  Stream.mergeAll([store.state.changes, store.log.changes, store.viewing.changes], {
    concurrency: "unbounded",
  }).pipe(Stream.map(Function.constVoid))

const done = (
  store: Store.Inspected,
  ask: Ask,
): Effect.Effect<void, { readonly message: string }> => {
  if (ask._tag === "TravelTo") return store.travelTo(ask.seq)
  if (ask._tag === "Run") return store.run(ask.action, ask.payload)

  return store.load(ask.entries)
}

const keptUp = <A, E, R>(what: string, work: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  work.pipe(
    Effect.tapError((cause) => Effect.logDebug(`The devtools link stopped ${what}`, cause)),
    Effect.retry(Schedule.spaced("2 seconds")),
  )

const link = Effect.gen(function* () {
  const registry = yield* Devtools.Registry
  const server = yield* RpcClient.make(PageRpcs)
  const report = registry.stores.get.pipe(
    Effect.flatMap(Effect.forEach(snapshotOf)),
    Effect.flatMap((stores) => server.Report({ stores })),
  )

  const carryOut = Effect.fnUntraced(function* ({ id, ask }: Command) {
    const stores = yield* registry.stores.get
    const problem = yield* Effect.fromNullishOr(stores.find((each) => each.key === ask.store)).pipe(
      Effect.mapError(() => ({ message: `There is no store called ${ask.store}.` })),
      Effect.flatMap((store) => done(store, ask)),
      Effect.as(null),
      Effect.catch((failed) => Effect.succeed(failed.message)),
    )

    yield* report
    yield* server.Outcome({ id, problem })
  })

  const reporting = registry.stores.changes.pipe(
    Stream.switchMap((stores) =>
      Stream.mergeAll(stores.map(changesOf), { concurrency: "unbounded" }),
    ),
    Stream.debounce("20 millis"),
    Stream.runForEach(() => report),
  )

  yield* Effect.forkScoped(keptUp("reporting", reporting), { startImmediately: true })
  yield* Effect.forkScoped(
    keptUp("taking commands", Stream.runForEach(server.Commands(), carryOut)),
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
  )
