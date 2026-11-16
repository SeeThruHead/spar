import {
  Array,
  Cause,
  Context,
  Effect,
  Layer,
  Option,
  Record,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
  Struct,
} from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import * as Cell from "./internal/cell.ts"
import { provideTo } from "./internal/context.ts"
import { report } from "./internal/crash.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { Outbox } from "./Outbox.ts"
import { Tabs } from "./Tabs.ts"

const StoredEntry = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

const Snapshot = Schema.Struct({ seq: Schema.Int, state: Schema.Json })

const Head = Schema.Struct({ seq: Schema.Int, compactedAt: Schema.Int })

const Intent = Schema.Struct({ action: Schema.String, payload: Schema.Json })

type Orphan = typeof Intent.Type & { readonly key: string }

export type Entry = typeof StoredEntry.Type

export const LogText = Schema.fromJsonString(Schema.Array(StoredEntry))

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

type Step<State> = { readonly seq: number; readonly state: State }

type Past<State> = {
  readonly log: ReadonlyArray<Entry>
  readonly trail: ReadonlyArray<Step<State>>
}

type Held<State> = Past<State> & {
  readonly state: State
  readonly viewing: number | null
  readonly borrowed: Past<State> | null
}

const pastOf = <State>(held: Held<State>): Past<State> => held.borrowed ?? held

const shown = <State>(held: Held<State>): State =>
  Option.match(
    Array.findFirst(pastOf(held).trail, (step) => step.seq === held.viewing),
    { onNone: () => held.state, onSome: (step) => step.state },
  )

export type Inspected = {
  readonly key: string
  readonly state: Reactive<unknown>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly load: (
    entries: ReadonlyArray<Entry>,
  ) => Effect.Effect<void, Schema.SchemaError | UnknownAction>
  readonly run: (
    action: string,
    payload: Schema.Json,
  ) => Effect.Effect<void, Schema.SchemaError | UnknownAction>
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

type Open<State, E, R> = (leftovers: ReadonlyArray<Entry>) => Effect.Effect<Journal<State>, E, R>

export class UnknownAction extends Schema.TaggedError<
  UnknownAction,
  { readonly brand: unique symbol }
>()("UnknownAction", { action: Schema.String }) {
  override get message() {
    return `The log holds an action this store does not define: ${this.action}`
  }
}

export class Abandoned extends Schema.TaggedError<Abandoned, { readonly brand: unique symbol }>()(
  "Abandoned",
  { store: Schema.String, action: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `An earlier tab asked ${this.store} for "${this.action}" and closed before it was done. This version cannot carry it out, so it was dropped.`
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

const stepsFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
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

const inMemory =
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

const onDevice = <State, Encoded, A extends Actions<State>, S extends Selectors<State>>(
  key: string,
  definition: Definition<State, A, S>,
  durable: Durable<State, Encoded>,
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
      const stateJson = Schema.toCodecJson(durable.state)
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

const makeLayer = <Self, State, A extends Actions<State>, S extends Selectors<State>, R, E, RO>(
  service: Context.Key<Self, Shape<State, A, S>>,
  key: string,
  definition: Definition<State, A, S>,
  reactions: ReadonlyArray<Reaction<State, R>>,
  open: Open<State, E, RO>,
): Layer.Layer<Self, E, R | Exclude<RO, Scope.Scope> | SecureRandom.SecureRandom> =>
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
      const inspector = yield* Inspector
      const restored =
        inspector.keepStates === 0
          ? []
          : yield* Effect.orDie(stepsFrom(definition, journal.base, journal.entries))
      const opened: Held<State> = {
        state: journal.state,
        log: journal.entries,
        trail: lastOf(restored, inspector.keepStates),
        viewing: null,
        borrowed: null,
      }
      const cell = Cell.make(opened)
      const current = fromCell(cell)
      const state = map(current, shown)
      const viewing = map(current, (held) => held.viewing)
      const travelTo = (seq: number | null): Effect.Effect<void> =>
        Effect.sync(() => {
          const held = cell.read()

          cell.write({ ...held, viewing: seq, borrowed: seq === null ? null : held.borrowed })
        })
      const load = (entries: ReadonlyArray<Entry>) =>
        Effect.map(stepsFrom(definition, definition.initialState, entries), (trail) =>
          cell.write({
            ...cell.read(),
            viewing: trail.at(-1)?.seq ?? null,
            borrowed: { log: entries, trail },
          }),
        )

      const absorb = Effect.gen(function* () {
        const applied = yield* Ref.get(sequence)
        const fresh = yield* journal.news(applied)
        if (fresh.lastSeq <= applied) return

        const before = cell.read()
        const next = yield* Effect.orDie(
          replayFrom(
            definition,
            Option.getOrElse(fresh.restart, () => before.state),
            fresh.entries,
          ),
        )

        yield* Ref.set(sequence, fresh.lastSeq)
        cell.write({
          ...before,
          state: next,
          log: [...before.log, ...fresh.entries].slice(-logLimit),
          trail: lastOf(
            [...before.trail, { seq: fresh.lastSeq, state: next }],
            inspector.keepStates,
          ),
        })
      })

      const record = Effect.fnUntraced(function* (
        name: string,
        handled: Action<State, unknown>,
        payload: Schema.Json,
        reduce: (state: State) => State,
        intent: string,
      ) {
        yield* absorb

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
        yield* journal.settle(intent)
        cell.write({
          ...before,
          state: next,
          log: [...before.log, entry].slice(-logLimit),
          trail: lastOf([...before.trail, { seq, state: next }], inspector.keepStates),
        })
        yield* journal.tell

        return { entry, next }
      })

      const react = (
        handled: Action<State, unknown>,
        done: { readonly entry: Entry; readonly next: State },
      ) =>
        Effect.forEach(
          reactionsTo(handled),
          (reaction) => Effect.forkIn(reaction.run(done.entry, done.next), scope),
          { discard: true },
        )

      const adopt = (orphan: Orphan) =>
        Record.get(named, orphan.action).pipe(
          Effect.fromOption,
          Effect.flatMap((handled) =>
            handled.reducer(orphan.payload).pipe(
              Effect.flatMap((reduce) =>
                record(orphan.action, handled, orphan.payload, reduce, orphan.key),
              ),
              Effect.map((done) => ({ handled, done })),
            ),
          ),
          Effect.asSome,
          Effect.catch((cause) =>
            journal
              .settle(orphan.key)
              .pipe(
                Effect.andThen(report(new Abandoned({ store: key, action: orphan.action, cause }))),
                Effect.as(Option.none()),
              ),
          ),
        )

      const command = (name: string, handled: Action<State, unknown>) => {
        const carryOut = Effect.fnUntraced(
          function* (input: unknown) {
            const payload = yield* handled.encode(input)
            const reduce = yield* handled.reducer(payload)
            const intent = yield* journal.intend(name, payload)
            const done = yield* Semaphore.withPermit(
              turn,
              journal.exclusively(record(name, handled, payload, reduce, intent)),
            )

            yield* react(handled, done)
          },
          Effect.orDie,
          (effect) => provideTo<void, never, R>(effect, context),
          (effect) => Effect.withSpan(effect, channelOf(key, name), { captureStackTrace: false }),
        )

        return (input: unknown) => Effect.suspend(() => carryOut(input))
      }

      yield* Effect.forkIn(
        Stream.runForEach(journal.told, () =>
          Effect.catchDefect(Semaphore.withPermit(turn, journal.exclusively(absorb)), report),
        ),
        scope,
        { startImmediately: true },
      )
      yield* provideTo(
        eachReaction((reaction, channel) => reaction.start(channel)),
        Context.add(context, Scope.Scope, scope),
      )

      const adopted = yield* provideTo(
        Semaphore.withPermit(
          turn,
          journal.exclusively(Effect.flatMap(journal.orphans, Effect.forEach(adopt))),
        ),
        context,
      )

      yield* provideTo(
        Effect.forEach(
          adopted.flatMap(Option.toArray),
          ({ handled, done }) => react(handled, done),
          { discard: true },
        ),
        context,
      )

      const commands = Record.map(named, (handled, name) => command(name, handled))
      const log = map(current, (held) => pastOf(held).log)

      yield* inspector.register({
        key,
        state,
        log,
        viewing,
        travelTo,
        load,
        run: (name, payload) =>
          Record.get(named, name).pipe(
            Effect.fromOption,
            Effect.mapError(() => new UnknownAction({ action: name })),
            Effect.flatMap((handled) =>
              Effect.flatMap(handled.decode(payload), command(name, handled)),
            ),
          ),
      })

      return {
        state,
        log,
        viewing,
        travelTo,
        select: Struct.map(
          selectors,
          Struct.lambda<ToReactive<State>>((selector) => map(state, selector)),
        ),
        commands,
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
