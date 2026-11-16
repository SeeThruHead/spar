import {
  Cause,
  Context,
  Duration,
  Effect,
  Function,
  Layer,
  Option,
  Schedule,
  Schema,
  Stream,
  Struct,
  SubscriptionRef,
} from "effect"
import type { Scope } from "effect"
import { KeyValueStore } from "effect/persistence"
import * as Events from "./Events.ts"
import { events, on } from "./internal/listen.ts"
import { fromSubscriptionRef, succeed } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"

const Stored = Schema.Struct({
  channel: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

const Buried = Schema.Struct({ ...Stored.fields, reason: Schema.String })

export type Entry = {
  readonly key: string
  readonly channel: string
  readonly payload: Schema.Json
  readonly seq: number
}

export type Dead = Entry & { readonly reason: string }

export type Options = {
  readonly maxAttempts: number
  readonly attemptTimeout: Duration.Input
}

export type Environment = {
  readonly online: Reactive<boolean>
  readonly ownership: Effect.Effect<void, never, Scope.Scope>
  readonly announce: Effect.Effect<void>
  readonly announced: Stream.Stream<void>
}

const alone: Environment = {
  online: succeed(true),
  ownership: Effect.void,
  announce: Effect.void,
  announced: Stream.empty,
}

export const Environment = Context.Reference<Environment>("spar/Outbox/Environment", {
  defaultValue: () => alone,
})

const defaults: Options = { maxAttempts: 8, attemptTimeout: "10 seconds" }

const sharedName = "spar/outbox"

export const retryPolicy = Schedule.exponential("250 millis").pipe(
  Schedule.modifyDelay((metadata) =>
    Effect.succeed(Duration.min(metadata.duration, Duration.seconds(5))),
  ),
)

const bySeq = <A extends Entry>(entries: ReadonlyArray<A>): ReadonlyArray<A> =>
  entries.toSorted((left, right) => left.seq - right.seq)

const untilOnline = (online: Reactive<boolean>): Effect.Effect<void> =>
  Effect.flatMap(online.get, (connected) =>
    connected
      ? Effect.void
      : Effect.asVoid(Stream.runHead(Stream.filter(online.changes, Function.identity))),
  )

const make = Effect.fnUntraced(function* (options: Options) {
  const keyValueStore = yield* KeyValueStore.KeyValueStore
  const environment = yield* Environment
  const waiting = KeyValueStore.toSchemaStore(
    KeyValueStore.prefix(keyValueStore, "spar/outbox/"),
    Stored,
  )
  const buried = KeyValueStore.toSchemaStore(
    KeyValueStore.prefix(keyValueStore, "spar/outbox-dead/"),
    Buried,
  )

  const setAsideUnreadable = Effect.fnUntraced(function* (key: string) {
    const raw = yield* keyValueStore.get(`spar/outbox/${key}`)

    yield* buried.set(key, {
      channel: "unreadable",
      payload: `${raw}`,
      seq: 0,
      reason: "What was saved for this item could not be read, so it was not sent.",
    })
    yield* waiting.remove(key)

    return Option.none<Entry>()
  })

  const stored = Effect.fnUntraced(function* () {
    const keys = yield* waiting.keys
    const found = yield* Effect.forEach(keys, (key) =>
      waiting.get(key).pipe(
        Effect.map(Option.map((entry): Entry => ({ key, ...entry }))),
        Effect.catchTag("SchemaError", () => setAsideUnreadable(key)),
      ),
    )

    return bySeq(found.flatMap(Option.toArray))
  }, Effect.orDie)

  const graveyard = Effect.fnUntraced(function* () {
    const keys = yield* buried.keys
    const found = yield* Effect.forEach(keys, (key) =>
      Effect.map(
        buried.get(key),
        Option.map((entry): Dead => ({ key, ...entry })),
      ),
    )

    return bySeq(found.flatMap(Option.toArray))
  }, Effect.orDie)

  const waitingAtStart = yield* stored()
  const deadAtStart = yield* graveyard()
  const wake = yield* SubscriptionRef.make(0)
  const pending = yield* SubscriptionRef.make(waitingAtStart.length)
  const dead = yield* SubscriptionRef.make(deadAtStart)

  const recount = Effect.gen(function* () {
    const entries = yield* stored()
    const lost = yield* graveyard()

    yield* SubscriptionRef.set(pending, entries.length)
    yield* SubscriptionRef.set(dead, lost)
  })

  const wakeWorkers = Effect.andThen(
    recount,
    SubscriptionRef.update(wake, (count) => count + 1),
  )

  const changed = Effect.andThen(recount, environment.announce)

  const added = Effect.andThen(wakeWorkers, environment.announce)

  yield* Effect.forkScoped(
    Stream.runForEach(environment.announced, () => wakeWorkers),
    { startImmediately: true },
  )

  const persist = Effect.fn("Outbox.persist")(function* ({ key, ...entry }: Entry) {
    yield* waiting.set(key, entry)
    yield* added
  }, Effect.orDie)

  const persisted = Effect.fn("Outbox.persisted")(function* (channel: string) {
    const entries = yield* stored()

    return entries.filter((entry) => entry.channel === channel)
  })

  const confirm = Effect.fn("Outbox.confirm")(function* (key: string) {
    yield* waiting.remove(key)
    yield* changed
  }, Effect.orDie)

  const bury = Effect.fn("Outbox.bury")(function* ({ key, ...entry }: Entry, reason: string) {
    yield* buried.set(key, { ...entry, reason })
    yield* waiting.remove(key)
    yield* changed
  }, Effect.orDie)

  const deliver = <E, R>(
    entry: Entry,
    send: (entry: Entry) => Effect.Effect<void, E, R>,
  ): Effect.Effect<void, never, R> =>
    Effect.andThen(untilOnline(environment.online), send(entry)).pipe(
      Effect.timeout(options.attemptTimeout),
      Effect.retry({ schedule: retryPolicy, times: options.maxAttempts - 1 }),
      Effect.matchCauseEffect({
        onSuccess: () => confirm(entry.key),
        onFailure: (cause) => bury(entry, Cause.pretty(cause)),
      }),
      Effect.withSpan("Outbox.deliver", {
        attributes: { "outbox.key": entry.key, "outbox.channel": entry.channel },
      }),
    )

  const register = <E, R>(
    channel: string,
    send: (entry: Entry) => Effect.Effect<void, E, R>,
  ): Effect.Effect<void, never, R | Scope.Scope> =>
    Effect.asVoid(
      Effect.forkScoped(
        Effect.andThen(
          environment.ownership,
          Stream.runForEach(SubscriptionRef.changes(wake), () =>
            Effect.flatMap(persisted(channel), (entries) =>
              Effect.forEach(entries, (entry) => deliver(entry, send), { discard: true }),
            ),
          ),
        ),
        { startImmediately: true },
      ),
    )

  const retry = Effect.fn("Outbox.retry")(function* (key: string) {
    const found = yield* buried.get(key)

    yield* Effect.forEach(Option.toArray(found), (entry) =>
      waiting.set(key, Struct.omit(entry, ["reason"])),
    )
    yield* buried.remove(key)
    yield* added
  }, Effect.orDie)

  const discard = Effect.fn("Outbox.discard")(function* (key: string) {
    yield* buried.remove(key)
    yield* changed
  }, Effect.orDie)

  return {
    persist,
    register,
    persisted,
    retry,
    discard,
    pending: fromSubscriptionRef(pending),
    dead: fromSubscriptionRef(dead),
  }
})

export class Outbox extends Context.Service<
  Outbox,
  {
    readonly persist: (entry: Entry) => Effect.Effect<void>
    readonly register: <E, R>(
      channel: string,
      send: (entry: Entry) => Effect.Effect<void, E, R>,
    ) => Effect.Effect<void, never, R | Scope.Scope>
    readonly persisted: (channel: string) => Effect.Effect<ReadonlyArray<Entry>>
    readonly retry: (key: string) => Effect.Effect<void>
    readonly discard: (key: string) => Effect.Effect<void>
    readonly pending: Reactive<number>
    readonly dead: Reactive<ReadonlyArray<Dead>>
  }
>()("spar/Outbox") {
  static readonly layerWith = (options: Options) => Layer.effect(Outbox, make(options))

  static readonly layer = Outbox.layerWith(defaults)
}

const holdLock = (locks: LockManager): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(
    Effect.acquireRelease(
      Effect.callback<PromiseWithResolvers<void>>((resume, signal) => {
        const held = Promise.withResolvers<void>()

        locks
          .request(sharedName, { signal }, () => {
            resume(Effect.succeed(held))

            return held.promise
          })
          .catch(Function.constVoid)
      }),
      (held) => Effect.sync(() => held.resolve()),
    ),
  )

const ownTheSending: Effect.Effect<void, never, Scope.Scope> = Effect.suspend(() =>
  Effect.forEach(Option.toArray(Option.fromNullishOr(navigator.locks)), holdLock, {
    discard: true,
  }),
)

export const layerBrowser = Layer.effect(
  Environment,
  Effect.gen(function* () {
    const online = yield* Events.online
    const peers = yield* Effect.acquireRelease(
      Effect.sync(() => new BroadcastChannel(sharedName)),
      (channel) => Effect.sync(() => channel.close()),
    )

    return {
      online,
      ownership: ownTheSending,
      announce: Effect.sync(() => peers.postMessage("changed")),
      announced: events(on(peers, "message"), Function.constVoid),
    }
  }),
)
