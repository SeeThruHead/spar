import {
  Array,
  Context,
  Effect,
  Layer,
  Option,
  Record,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Struct,
} from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import * as Cell from "./internal/cell.ts"
import { provideTo } from "./internal/context.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { Outbox } from "./Outbox.ts"

const StoredEntry = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

const Snapshot = Schema.Struct({ seq: Schema.Int, state: Schema.Json })

export type Entry = typeof StoredEntry.Type

export type Action<State, Payload> = {
  readonly encode: (input: unknown) => Effect.Effect<Schema.Json, Schema.SchemaError>
  readonly decode: (payload: Schema.Json) => Effect.Effect<Payload, Schema.SchemaError>
  readonly reducer: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State, Schema.SchemaError>
}

export type Reaction<State, R = never> = {
  readonly action: Action<State, unknown>
  readonly persist: (channel: string, entry: Entry) => Effect.Effect<void, never, R>
  readonly run: (entry: Entry, state: State) => Effect.Effect<void, never, R>
  readonly start: (channel: string) => Effect.Effect<void, never, R | Scope.Scope>
  readonly leftovers: (
    channel: string,
    action: string,
  ) => Effect.Effect<ReadonlyArray<Entry>, never, R>
}

export type Durable<State, Encoded> = {
  readonly state: Schema.Codec<State, Encoded>
  readonly compactAfter?: number
}

type Actions<State> = Readonly<Record<string, Action<State, unknown>>>

type Selectors<State> = Readonly<Record<string, (state: State) => unknown>>

type PayloadOf<A> = A extends {
  readonly decode: (payload: Schema.Json) => Effect.Effect<infer Payload, Schema.SchemaError>
}
  ? Payload
  : never

interface ToReactive<State> extends Struct.Lambda {
  (selector: (state: State) => unknown): Reactive<unknown>
  readonly "~lambda.out": this["~lambda.in"] extends (state: never) => infer A ? Reactive<A> : never
}

type Held<State> = {
  readonly state: State
  readonly log: ReadonlyArray<Entry>
  readonly trail: ReadonlyArray<{ readonly seq: number; readonly state: State }>
  readonly viewing: number | null
}

const shown = <State>(held: Held<State>): State =>
  Option.match(
    Array.findFirst(held.trail, (step) => step.seq === held.viewing),
    { onNone: () => held.state, onSome: (step) => step.state },
  )

export type Inspected = {
  readonly key: string
  readonly state: Reactive<unknown>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
}

export const Inspector = Context.Reference<{
  readonly keepStates: number
  readonly register: (store: Inspected) => Effect.Effect<void>
}>("spar/Store/Inspector", {
  defaultValue: () => ({ keepStates: 0, register: () => Effect.void }),
})

const lastOf = <A>(items: ReadonlyArray<A>, count: number): ReadonlyArray<A> =>
  count === 0 ? [] : items.slice(-count)

export type Shape<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Reactive<State>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly select: { readonly [Name in keyof S]: Struct.Apply<ToReactive<State>, S[Name]> }
  readonly commands: {
    readonly [Name in keyof A & string]: (payload: PayloadOf<A[Name]>) => Effect.Effect<void>
  }
}

export type Definition<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly initialState: State
  readonly actions: A
  readonly selectors: S
}

type Journal<State> = {
  readonly state: State
  readonly entries: ReadonlyArray<Entry>
  readonly lastSeq: number
  readonly append: (entry: Entry, next: State) => Effect.Effect<void>
}

type Open<State, E, R> = (leftovers: ReadonlyArray<Entry>) => Effect.Effect<Journal<State>, E, R>

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

const logLimit = 1000

const compactAfterDefault = 200

export const action = <Payload, Encoded, State>(
  schema: Schema.Codec<Payload, Encoded>,
  reduce: (state: State, payload: Payload) => State,
): Action<State, Payload> => {
  const json = Schema.toCodecJson(schema)
  const decode = Schema.decodeUnknownEffect(json)

  return {
    encode: Schema.encodeUnknownEffect(json),
    decode,
    reducer: (payload) =>
      Effect.map(decode(payload), (decoded) => (state) => reduce(state, decoded)),
  }
}

const channelOf = (key: string, name: string): string => `${key}/${name}`

const bySeq = (entries: ReadonlyArray<Entry>): ReadonlyArray<Entry> =>
  entries.toSorted((left, right) => left.seq - right.seq)

const lastSeqOf = (entries: ReadonlyArray<Entry>, otherwise: number): number =>
  entries.reduce((last, entry) => Math.max(last, entry.seq), otherwise)

const slot = (seq: number): string => seq.toString().padStart(12, "0")

const replayFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
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

export const replay = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  replayFrom(definition, definition.initialState, entries)

const inMemory =
  <State>(initialState: State): Open<State, never, never> =>
  () =>
    Effect.succeed({ state: initialState, entries: [], lastSeq: 0, append: () => Effect.void })

const onDevice = <State, Encoded, A extends Actions<State>, S extends Selectors<State>>(
  key: string,
  definition: Definition<State, A, S>,
  durable: Durable<State, Encoded>,
): Open<State, Unreadable, KeyValueStore.KeyValueStore> =>
  Effect.fnUntraced(
    function* (leftovers: ReadonlyArray<Entry>) {
      const keyValueStore = yield* KeyValueStore.KeyValueStore
      const device = KeyValueStore.prefix(keyValueStore, `spar/store/${key}/`)
      const snapshots = KeyValueStore.toSchemaStore(device, Snapshot)
      const log = KeyValueStore.toSchemaStore(KeyValueStore.prefix(device, "log/"), StoredEntry)
      const stateJson = Schema.toCodecJson(durable.state)
      const compactAfter = durable.compactAfter ?? compactAfterDefault

      const snapshot = yield* snapshots.get("snapshot")
      const base = yield* Option.match(snapshot, {
        onNone: () => Effect.succeed({ state: definition.initialState, seq: 0 }),
        onSome: ({ seq, state }) =>
          Effect.map(Schema.decodeEffect(stateJson)(state), (decoded) => ({
            state: decoded,
            seq,
          })),
      })

      const keys = yield* log.keys
      const found = yield* Effect.forEach(keys.toSorted(), (slotKey) => log.get(slotKey))
      const saved = found.flatMap(Option.toArray).filter((entry) => entry.seq > base.seq)
      const lastSaved = lastSeqOf(saved, base.seq)
      const missed = bySeq(leftovers.filter((entry) => entry.seq > lastSaved))
      const entries = [...saved, ...missed]

      yield* Effect.forEach(missed, (entry) => log.set(slot(entry.seq), entry), { discard: true })

      const state = yield* replayFrom(definition, base.state, entries)
      const compactedAt = yield* Ref.make(base.seq)

      const compact = Effect.fnUntraced(function* (entry: Entry, next: State) {
        const encoded = yield* Schema.encodeUnknownEffect(stateJson)(next)
        const written = yield* log.keys

        yield* snapshots.set("snapshot", { seq: entry.seq, state: encoded })
        yield* Effect.forEach(written, (slotKey) => log.remove(slotKey), { discard: true })
        yield* Ref.set(compactedAt, entry.seq)
      })

      const append = Effect.fnUntraced(function* (entry: Entry, next: State) {
        yield* log.set(slot(entry.seq), entry)

        const since = yield* Ref.get(compactedAt)
        if (entry.seq - since < compactAfter) return

        yield* compact(entry, next)
      }, Effect.orDie)

      return { state, entries, lastSeq: lastSeqOf(entries, base.seq), append }
    },
    Effect.mapError((cause) => new Unreadable({ store: key, cause })),
  )

const makeLayer = <Self, State, A extends Actions<State>, S extends Selectors<State>, R, E, RO>(
  service: Context.Key<Self, Shape<State, A, S>>,
  key: string,
  definition: Definition<State, A, S>,
  reactions: ReadonlyArray<Reaction<State, R>>,
  open: Open<State, E, RO>,
): Layer.Layer<Self, E, R | RO | SecureRandom.SecureRandom> =>
  Layer.effect(
    service,
    Effect.gen(function* () {
      const { actions, selectors } = definition
      const random = yield* SecureRandom.SecureRandom
      const context = yield* Effect.context<R>()
      const scope = yield* Effect.scope
      const turn = yield* Semaphore.make(1)
      const named: Readonly<Record<keyof A & string, Action<State, unknown>>> = actions
      const reactionsTo = (handled: Action<State, unknown>) =>
        reactions.filter((reaction) => reaction.action === handled)

      const eachReaction = <B, R2>(
        use: (
          reaction: Reaction<State, R>,
          channel: string,
          name: string,
        ) => Effect.Effect<B, never, R2>,
      ) =>
        Effect.forEach(Record.toEntries(named), ([name, handled]) =>
          Effect.forEach(reactionsTo(handled), (reaction) =>
            use(reaction, channelOf(key, name), name),
          ),
        )

      const leftBehind = yield* provideTo(
        eachReaction((reaction, channel, name) => reaction.leftovers(channel, name)),
        context,
      )
      const leftovers = leftBehind.flat(2)
      const journal = yield* open(leftovers)
      const sequence = yield* Ref.make(lastSeqOf(leftovers, journal.lastSeq))
      const opened: Held<State> = {
        state: journal.state,
        log: journal.entries,
        trail: [],
        viewing: null,
      }
      const cell = Cell.make(opened)
      const current = fromCell(cell)
      const state = map(current, shown)
      const viewing = map(current, (held) => held.viewing)
      const travelTo = (seq: number | null): Effect.Effect<void> =>
        Effect.sync(() => cell.write({ ...cell.read(), viewing: seq }))
      const inspector = yield* Inspector

      yield* inspector.register({
        key,
        state,
        log: map(current, (held) => held.log),
        viewing,
        travelTo,
      })

      const record = Effect.fnUntraced(function* (
        name: string,
        handled: Action<State, unknown>,
        payload: Schema.Json,
        reduce: (state: State) => State,
      ) {
        const id = yield* random.uuidV7()
        const seq = yield* Ref.updateAndGet(sequence, (last) => last + 1)
        const entry: Entry = { id, action: name, payload, seq }
        const before = cell.read()
        const next = reduce(before.state)

        yield* Effect.annotateCurrentSpan({
          "spar.store": key,
          "spar.action": name,
          "spar.entry": id,
        })
        yield* Effect.forEach(
          reactionsTo(handled),
          (reaction) => reaction.persist(channelOf(key, name), entry),
          { discard: true },
        )
        yield* journal.append(entry, next)
        cell.write({
          state: next,
          log: [...before.log, entry].slice(-logLimit),
          trail: lastOf([...before.trail, { seq, state: next }], inspector.keepStates),
          viewing: before.viewing,
        })

        return { entry, next }
      })

      const command = (name: string, handled: Action<State, unknown>) =>
        Effect.fn(channelOf(key, name))(
          function* (input: unknown) {
            const payload = yield* handled.encode(input)
            const reduce = yield* handled.reducer(payload)
            const { entry, next } = yield* Semaphore.withPermit(
              turn,
              record(name, handled, payload, reduce),
            )

            yield* Effect.forEach(
              reactionsTo(handled),
              (reaction) => Effect.forkIn(reaction.run(entry, next), scope),
              { discard: true },
            )
          },
          Effect.orDie,
          (effect) => provideTo<void, never, R>(effect, context),
        )

      yield* provideTo(
        eachReaction((reaction, channel) => reaction.start(channel)),
        Context.add(context, Scope.Scope, scope),
      )

      return {
        state,
        log: map(current, (held) => held.log),
        viewing,
        travelTo,
        select: Struct.map(
          selectors,
          Struct.lambda<ToReactive<State>>((selector) => map(state, selector)),
        ),
        commands: Record.map(named, (handled, name) => command(name, handled)),
      }
    }),
  )

export const Tag =
  <Self>() =>
  <
    const Key extends string,
    State,
    const A extends Actions<State>,
    const S extends Selectors<State>,
  >(
    key: Key,
    definition: Definition<State, A, S>,
  ) => {
    const service = Context.Service<Self, Shape<State, A, S>>()(key)

    return class extends service {
      static readonly definition = definition
      static readonly actions = definition.actions
      static readonly layer = <R = never>(reactions: ReadonlyArray<Reaction<State, R>> = []) =>
        makeLayer(service, key, definition, reactions, inMemory(definition.initialState))
      static readonly layerDurable = <Encoded, R = never>(
        durable: Durable<State, Encoded>,
        reactions: ReadonlyArray<Reaction<State, R>> = [],
      ) => makeLayer(service, key, definition, reactions, onDevice(key, definition, durable))
    }
  }

export const after = <State, Payload, R>(
  trigger: Action<State, Payload>,
  effect: (payload: Payload, state: State) => Effect.Effect<void, never, R>,
): Reaction<State, R> => ({
  action: trigger,
  persist: () => Effect.void,
  run: (entry, state) =>
    trigger.decode(entry.payload).pipe(
      Effect.orDie,
      Effect.flatMap((payload) => effect(payload, state)),
    ),
  start: () => Effect.void,
  leftovers: () => Effect.succeed([]),
})

export const outbox = <State, Payload, E, R>(
  trigger: Action<State, Payload>,
  send: (payload: Payload, idempotencyKey: string) => Effect.Effect<void, E, R>,
): Reaction<State, R | Outbox> => ({
  action: trigger,
  persist: (channel, entry) =>
    Outbox.use((service) =>
      service.persist({ key: entry.id, channel, payload: entry.payload, seq: entry.seq }),
    ),
  run: () => Effect.void,
  start: (channel) =>
    Outbox.use((service) =>
      service.register(channel, (waiting) =>
        Effect.flatMap(Effect.orDie(trigger.decode(waiting.payload)), (payload) =>
          send(payload, waiting.key),
        ),
      ),
    ),
  leftovers: (channel, name) =>
    Outbox.use((service) =>
      Effect.map(service.persisted(channel), (waiting) =>
        waiting.map((entry) => ({
          id: entry.key,
          action: name,
          payload: entry.payload,
          seq: entry.seq,
        })),
      ),
    ),
})
