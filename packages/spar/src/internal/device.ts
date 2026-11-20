import { Array, Effect, Option, Ref, Schema } from "effect"
import type { Cause, Scope } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { Tabs } from "../Tabs.ts"
import {
  Intent,
  StoredEntry,
  Unreadable,
  lastSeqOf,
  nothingNew,
  replayFrom,
  type Actions,
  type Definition,
  type Durable,
  type Entry,
  type Journal,
  type Open,
  type Orphan,
  type Selectors,
} from "./journal.ts"

const Snapshot = Schema.Struct({ seq: Schema.Int, state: Schema.Json })

const Head = Schema.Struct({ seq: Schema.Int, compactedAt: Schema.Int })

const compactAfterDefault = 200

const bySeq = (entries: ReadonlyArray<Entry>): ReadonlyArray<Entry> =>
  entries.toSorted((left, right) => left.seq - right.seq)

const slot = (seq: number): string => seq.toString().padStart(12, "0")

const ownerOf = (intent: string): string => intent.slice(0, intent.indexOf("/"))

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
