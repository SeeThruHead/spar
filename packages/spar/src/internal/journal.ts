import { Array, Data, Effect, Option, Record, Ref, Schema, Stream } from "effect"
import type { Cause, Scope } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { Tabs } from "../Tabs.ts"

export const StoredEntry = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

const Snapshot = Schema.Struct({ seq: Schema.Int, state: Schema.Json })

const Head = Schema.Struct({ seq: Schema.Int, compactedAt: Schema.Int })

const Intent = Schema.Struct({ action: Schema.String, payload: Schema.Json })

export type Orphan = typeof Intent.Type & { readonly key: string }

export type Entry = typeof StoredEntry.Type

export const Entries = Schema.Array(StoredEntry)

export const LogText = Schema.fromJsonString(Entries)

export class Refused extends Data.TaggedClass("Refused")<{ readonly reason: string }> {}

export type Action<State, Payload> = {
  readonly encode: (input: unknown) => Effect.Effect<Schema.Json, Schema.SchemaError>
  readonly decode: (payload: Schema.Json) => Effect.Effect<Payload, Schema.SchemaError>
  readonly attempt: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State | Refused, Schema.SchemaError>
  readonly reducer: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State, Schema.SchemaError>
}

export type Durable = { readonly compactAfter?: number }

export type Actions<State> = Readonly<Record<string, Action<State, unknown>>>

export type Selector<State, A> = {
  readonly schema: Schema.Codec<A, unknown>
  readonly select: (state: State) => A
}

export type Selectors<State> = Readonly<Record<string, Selector<State, unknown>>>

export type Step<State> = { readonly seq: number; readonly state: State }

export type Definition<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Schema.Codec<State, unknown>
  readonly initialState: State
  readonly actions: A
  readonly selectors: S
}

export type Journal<State> = {
  readonly base: State
  readonly state: State
  readonly entries: ReadonlyArray<Entry>
  readonly lastSeq: number
  readonly append: (entry: Entry, next: State) => Effect.Effect<void>
  readonly news: (applied: number) => Effect.Effect<News<State>>
  readonly exclusively: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly tell: Effect.Effect<void>
  readonly told: Stream.Stream<void>
  readonly intend: (action: string, payload: Schema.Json) => Effect.Effect<string>
  readonly settle: (intent: string) => Effect.Effect<void>
  readonly orphans: Effect.Effect<ReadonlyArray<Orphan>>
}

type News<State> = {
  readonly restart: Option.Option<State>
  readonly entries: ReadonlyArray<Entry>
  readonly lastSeq: number
}

export type Open<State, E, R> = (
  leftovers: ReadonlyArray<Entry>,
) => Effect.Effect<Journal<State>, E, R>

export class UnknownAction extends Schema.TaggedError<
  UnknownAction,
  { readonly brand: unique symbol }
>()("UnknownAction", { action: Schema.String }) {
  override get message() {
    return `The log holds an action this store does not define: ${this.action}`
  }
}

export class Unreadable extends Schema.TaggedError<Unreadable, { readonly brand: unique symbol }>()(
  "Unreadable",
  { store: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `What was saved for ${this.store} on this device could not be read. Clear it or read it with the version that wrote it.`
  }
}

const compactAfterDefault = 200

const bySeq = (entries: ReadonlyArray<Entry>): ReadonlyArray<Entry> =>
  entries.toSorted((left, right) => left.seq - right.seq)

export const lastSeqOf = (entries: ReadonlyArray<Entry>, otherwise: number): number =>
  entries.reduce((last, entry) => Math.max(last, entry.seq), otherwise)

const slot = (seq: number): string => seq.toString().padStart(12, "0")

export const replayFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  start: State,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  Effect.reduce(
    entries,
    () => start,
    (state, entry) =>
      Record.get(definition.actions, entry.action).pipe(
        Effect.fromOption,
        Effect.mapError(() => new UnknownAction({ action: entry.action })),
        Effect.flatMap((found) => found.reducer(entry.payload)),
        Effect.map((reduce) => reduce(state)),
      ),
  )

export const stepsFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  start: State,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<ReadonlyArray<Step<State>>, Schema.SchemaError | UnknownAction> =>
  Effect.map(
    Effect.reduce(
      entries,
      (): { readonly state: State; readonly steps: ReadonlyArray<Step<State>> } => ({
        state: start,
        steps: [],
      }),
      (reached, entry) =>
        Effect.map(replayFrom(definition, reached.state, [entry]), (state) => ({
          state,
          steps: [...reached.steps, { seq: entry.seq, state }],
        })),
    ),
    (reached) => reached.steps,
  )

export const replay = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  replayFrom(definition, definition.initialState, entries)

const ownerOf = (intent: string): string => intent.slice(0, intent.indexOf("/"))

const nothingNew = <State>(applied: number): News<State> => ({
  restart: Option.none(),
  entries: [],
  lastSeq: applied,
})

export const inMemory =
  <State>(initialState: State): Open<State, never, never> =>
  () =>
    Effect.succeed({
      base: initialState,
      state: initialState,
      entries: [],
      lastSeq: 0,
      append: () => Effect.void,
      news: (applied) => Effect.succeed(nothingNew(applied)),
      exclusively: (effect) => effect,
      tell: Effect.void,
      told: Stream.empty,
      intend: () => Effect.succeed(""),
      settle: () => Effect.void,
      orphans: Effect.succeed([]),
    })

export const onDevice = <State, A extends Actions<State>, S extends Selectors<State>>(
  key: string,
  definition: Definition<State, A, S>,
  durable: Durable,
): Open<State, Unreadable, KeyValueStore.KeyValueStore | SecureRandom.SecureRandom | Scope.Scope> =>
  Effect.fnUntraced(
    function* (leftovers: ReadonlyArray<Entry>) {
      const tabs = yield* Tabs
      const random = yield* SecureRandom.SecureRandom
      const session = yield* random.uuidV7()
      const shared = `spar/store/${key}`
      const keyValueStore = yield* KeyValueStore.KeyValueStore
      const device = KeyValueStore.prefix(keyValueStore, `spar/store/${key}/`)
      const snapshots = KeyValueStore.toSchemaStore(device, Snapshot)
      const log = KeyValueStore.toSchemaStore(KeyValueStore.prefix(device, "log/"), StoredEntry)
      const heads = KeyValueStore.toSchemaStore(device, Head)
      const intents = KeyValueStore.toSchemaStore(KeyValueStore.prefix(device, "pending/"), Intent)
      const intended = yield* Ref.make(0)
      const tabOf = (owner: string): string => `${shared}/tab/${owner}`

      yield* tabs.stay(tabOf(session))

      const intend = Effect.fnUntraced(function* (name: string, payload: Schema.Json) {
        const count = yield* Ref.updateAndGet(intended, (last) => last + 1)
        const intent = `${session}/${slot(count)}`

        yield* intents.set(intent, { action: name, payload })

        return intent
      }, Effect.orDie)

      const orphans = Effect.gen(function* () {
        const all = yield* intents.keys
        const owners = [...new Set(all.map(ownerOf))]
        const gone = yield* Effect.filter(owners, (owner) =>
          Effect.map(tabs.here(tabOf(owner)), (open) => !open),
        )
        const found = yield* Effect.forEach(
          all.toSorted().filter((intent) => gone.includes(ownerOf(intent))),
          (intent) =>
            intents.get(intent).pipe(
              Effect.map(Option.map((left): Orphan => ({ key: intent, ...left }))),
              Effect.catchTag("SchemaError", () =>
                Effect.as(intents.remove(intent), Option.none<Orphan>()),
              ),
            ),
        )

        return found.flatMap(Option.toArray)
      }).pipe(Effect.orDie)
      const stateJson = Schema.toCodecJson(definition.state)
      const decodeState = Schema.decodeEffect(stateJson)
      const compactAfter = durable.compactAfter ?? compactAfterDefault

      const read = Effect.gen(function* () {
        const snapshot = yield* snapshots.get("snapshot")
        const base = yield* Option.match(snapshot, {
          onNone: () => Effect.succeed({ state: definition.initialState, seq: 0 }),
          onSome: ({ seq, state }) =>
            Effect.map(decodeState(state), (decoded) => ({ state: decoded, seq })),
        })

        const keys = yield* log.keys
        const found = yield* Effect.forEach(keys.toSorted(), (slotKey) => log.get(slotKey))
        const saved = found.flatMap(Option.toArray).filter((entry) => entry.seq > base.seq)
        const lastSaved = lastSeqOf(saved, base.seq)
        const missed = bySeq(leftovers.filter((entry) => entry.seq > lastSaved))
        const entries = [...saved, ...missed]

        yield* Effect.forEach(missed, (entry) => log.set(slot(entry.seq), entry), {
          discard: true,
        })
        yield* heads.set("head", { seq: lastSeqOf(entries, base.seq), compactedAt: base.seq })

        return { base, entries, state: yield* replayFrom(definition, base.state, entries) }
      })

      const { base, entries, state } = yield* tabs.exclusively(shared, read)
      const compactedAt = yield* Ref.make(base.seq)

      const restartFrom = (
        applied: number,
        compacted: number,
      ): Effect.Effect<
        Option.Option<State>,
        KeyValueStore.KeyValueStoreError | Schema.SchemaError | Cause.NoSuchElementError
      > => {
        if (compacted <= applied) return Effect.succeedNone

        return snapshots.get("snapshot").pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.flatMap((snapshot) => decodeState(snapshot.state)),
          Effect.asSome,
        )
      }

      const news = Effect.fnUntraced(function* (applied: number) {
        const head = yield* heads.get("head")
        const now = Option.getOrUndefined(head)
        if (now === undefined) return nothingNew<State>(applied)
        if (now.seq <= applied) return nothingNew<State>(applied)

        const restart = yield* restartFrom(applied, now.compactedAt)
        const found = yield* Effect.forEach(
          Array.range(Math.max(applied, now.compactedAt) + 1, now.seq),
          (seq) => log.get(slot(seq)),
        )

        yield* Ref.set(compactedAt, now.compactedAt)

        return { restart, entries: found.flatMap(Option.toArray), lastSeq: now.seq }
      }, Effect.orDie)

      const compact = Effect.fnUntraced(function* (entry: Entry, next: State) {
        const encoded = yield* Schema.encodeUnknownEffect(stateJson)(next)
        const written = yield* log.keys

        yield* snapshots.set("snapshot", { seq: entry.seq, state: encoded })
        yield* Effect.forEach(written, (slotKey) => log.remove(slotKey), { discard: true })
        yield* Ref.set(compactedAt, entry.seq)
        yield* heads.set("head", { seq: entry.seq, compactedAt: entry.seq })
      })

      const append = Effect.fnUntraced(function* (entry: Entry, next: State) {
        yield* heads.set("head", { seq: entry.seq, compactedAt: yield* Ref.get(compactedAt) })
        yield* log.set(slot(entry.seq), entry)

        const since = yield* Ref.get(compactedAt)
        if (entry.seq - since < compactAfter) return

        yield* compact(entry, next)
      }, Effect.orDie)

      const journal: Journal<State> = {
        base: base.state,
        state,
        entries,
        lastSeq: lastSeqOf(entries, base.seq),
        append,
        news,
        exclusively: (effect) => tabs.exclusively(shared, effect),
        tell: tabs.announce(shared),
        told: tabs.announced(shared),
        intend,
        settle: (intent) => Effect.orDie(intents.remove(intent)),
        orphans,
      }

      return journal
    },
    Effect.mapError((cause) => new Unreadable({ store: key, cause })),
  )
