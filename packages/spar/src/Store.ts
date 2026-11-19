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
  Stream,
  Struct,
} from "effect"
import { SecureRandom } from "effect/crypto"
import * as Cell from "./internal/cell.ts"
import { provideTo } from "./internal/context.ts"
import { report } from "./internal/crash.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import {
  Entries,
  LogText,
  Refused,
  UnknownAction,
  Unreadable,
  inMemory,
  lastSeqOf,
  onDevice,
  replay,
  replayFrom,
  stepsFrom,
} from "./internal/journal.ts"
import type {
  Action,
  Actions,
  Definition,
  Durable,
  Entry,
  Open,
  Orphan,
  Selector,
  Selectors,
  Step,
} from "./internal/journal.ts"
import { sourced } from "./internal/inspect.ts"
import { Seed } from "./internal/server.ts"
import { Outbox } from "./Outbox.ts"
import { within } from "./View.ts"
import type { Mountable } from "./View.ts"
import * as Timeline from "./Timeline.ts"
import * as Diagnostics from "./Diagnostics.ts"

export { Entries, LogText, Refused, Seed, UnknownAction, Unreadable, replay }
export type { Action, Definition, Durable, Entry, Selector }

export type Send<State> = <Payload>(
  action: Action<State, Payload>,
  payload: Payload,
) => Effect.Effect<void>

export type Reaction<State, R = never> = {
  readonly action: Action<State, unknown>
  readonly persist: (channel: string, entry: Entry) => Effect.Effect<void, never, R>
  readonly run: (entry: Entry, state: State, send: Send<State>) => Effect.Effect<void, never, R>
  readonly start: (channel: string) => Effect.Effect<void, never, R | Scope.Scope>
  readonly leftovers: (
    channel: string,
    action: string,
  ) => Effect.Effect<ReadonlyArray<Entry>, never, R>
}

type Reactions<State, Needs extends ReadonlyArray<unknown>> = {
  readonly [Index in keyof Needs]: Reaction<State, Needs[Index]>
}

const listed = <State, Needs extends ReadonlyArray<unknown>>(
  reactions: Reactions<State, Needs> | undefined,
): ReadonlyArray<Reaction<State, Needs[number]>> => reactions ?? []

type PayloadOf<A> = A extends {
  readonly decode: (payload: Schema.Json) => Effect.Effect<infer Payload, Schema.SchemaError>
}
  ? Payload
  : never

interface ToReactive<State> extends Struct.Lambda {
  (selector: Selector<State, unknown>): Reactive<unknown>
  readonly "~lambda.out": this["~lambda.in"] extends Selector<never, infer A> ? Reactive<A> : never
}

type Past<State> = {
  readonly log: ReadonlyArray<Entry>
  readonly trail: ReadonlyArray<Step<State>>
}

type Held<State> = Past<State> & {
  readonly state: State
  readonly viewing: number | null
  readonly borrowed: Past<State> | null
  readonly refused: Option.Option<Refusal>
}

const pastOf = <State>(held: Held<State>): Past<State> => held.borrowed ?? held

const shown = <State>(held: Held<State>): State =>
  Option.match(
    Array.findFirst(pastOf(held).trail, (step) => step.seq === held.viewing),
    { onNone: () => held.state, onSome: (step) => step.state },
  )

export type Inspected = {
  readonly key: string
  readonly base: number
  readonly encoded: Effect.Effect<Schema.Json>
  readonly state: Reactive<unknown>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly actions: () => ReadonlyArray<{ readonly name: string; readonly payload: Schema.Json }>
  readonly hold: Effect.Effect<Effect.Effect<void>>
  readonly forkAt: (seq: number) => Effect.Effect<void>
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
  readonly forget?: (key: string) => Effect.Effect<void>
}>("spar/Store/Inspector", {
  defaultValue: () => ({ keepStates: 0, register: () => Effect.void }),
})

const lastOf = <A>(items: ReadonlyArray<A>, count: number): ReadonlyArray<A> =>
  count === 0 ? [] : items.slice(-count)

export type Shape<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Reactive<State>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly refused: Reactive<Option.Option<Refusal>>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly select: { readonly [Name in keyof S]: Struct.Apply<ToReactive<State>, S[Name]> }
  readonly commands: {
    readonly [Name in keyof A & string]: (payload: PayloadOf<A[Name]>) => Effect.Effect<void>
  }
}

export class Abandoned extends Schema.TaggedError<Abandoned, { readonly brand: unique symbol }>()(
  "Abandoned",
  { store: Schema.String, action: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return Diagnostics.text("SPAR_ABANDONED_ACTION", {
      said: `An earlier tab asked ${this.store} for "${this.action}" and closed before it was done. This version cannot carry it out, so it was dropped.`,
    })
  }
}

const logLimit = 1000

const accepted = <State>(before: State, tried: State | Refused): State =>
  tried instanceof Refused ? before : tried

export const action = <Payload, Encoded, State>(
  schema: Schema.Codec<Payload, Encoded>,
  reduce: (state: State, payload: Payload) => State,
  refusal: (state: NoInfer<State>, payload: NoInfer<Payload>) => string | null = () => null,
): Action<State, Payload> => {
  const json = Schema.toCodecJson(schema)
  const decode = Schema.decodeUnknownEffect(json)
  const attempt = (payload: Schema.Json) =>
    Effect.map(decode(payload), (decoded) => (state: State) => {
      const reason = refusal(state, decoded)

      return reason === null ? reduce(state, decoded) : new Refused({ reason })
    })

  return {
    encode: Schema.encodeUnknownEffect(json),
    payload: () => Schema.decodeUnknownSync(Schema.Json)(Schema.toJsonSchemaDocument(json)),
    decode,
    attempt,
    reducer: (payload) =>
      Effect.map(attempt(payload), (tried) => (state) => accepted(state, tried(state))),
  }
}

export const Refusal = Schema.Struct({
  action: Schema.String,
  reason: Schema.String,
  payload: Schema.Json,
})

export type Refusal = typeof Refusal.Type

export const selector = <A, State>(
  schema: Schema.Codec<A, unknown>,
  select: (state: State) => NoInfer<A>,
): Selector<State, A> => ({ schema, select })

const channelOf = (key: string, name: string): string => `${key}/${name}`

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
      const base = Option.match(Array.head(journal.entries), {
        onNone: () => journal.lastSeq,
        onSome: (first) => first.seq - 1,
      })
      const restored =
        inspector.keepStates === 0
          ? []
          : [
              { seq: base, state: journal.base },
              ...(yield* Effect.orDie(stepsFrom(definition, journal.base, journal.entries))),
            ]
      const opened: Held<State> = {
        state: journal.state,
        log: journal.entries,
        trail: lastOf(restored, inspector.keepStates),
        viewing: null,
        borrowed: null,
        refused: Option.none(),
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
      const hold = Effect.sync(() => {
        const held = cell.read()

        return Effect.sync(() => cell.write({ ...held, viewing: null, borrowed: null }))
      })
      const forkAt = (seq: number): Effect.Effect<void> =>
        Effect.sync(() => {
          const held = cell.read()

          cell.write(
            Option.match(
              Array.findFirst(held.trail, (step) => step.seq === seq),
              {
                onNone: () => held,
                onSome: (step) => ({
                  state: step.state,
                  log: held.log.filter((entry) => entry.seq <= seq),
                  trail: held.trail.filter((kept) => kept.seq <= seq),
                  viewing: null,
                  borrowed: null,
                  refused: Option.none(),
                }),
              },
            ),
          )
        })

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

      const turnAway = Effect.fnUntraced(function* (
        name: string,
        payload: Schema.Json,
        reason: string,
        intent: string,
      ) {
        yield* Effect.annotateCurrentSpan({
          "spar.store": key,
          "spar.action": name,
          "spar.refused": reason,
        })
        yield* journal.settle(intent)
        cell.write({ ...cell.read(), refused: Option.some({ action: name, reason, payload }) })
        yield* Timeline.note("refused", channelOf(key, name), () => ({ payload, reason }))

        return Option.none<{ readonly entry: Entry; readonly next: State }>()
      })

      const record = Effect.fnUntraced(function* (
        name: string,
        handled: Action<State, unknown>,
        payload: Schema.Json,
        attempt: (state: State) => State | Refused,
        intent: string,
      ) {
        yield* absorb

        const before = cell.read()
        const next = attempt(before.state)
        if (next instanceof Refused) return yield* turnAway(name, payload, next.reason, intent)

        const id = yield* random.uuidV7()
        const seq = yield* Ref.updateAndGet(sequence, (last) => last + 1)
        const entry: Entry = { id, action: name, payload, seq }

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
          refused: Option.none(),
        })
        yield* journal.tell
        yield* Timeline.note("command", channelOf(key, name), () => payload)

        return Option.some({ entry, next })
      })

      const send: Send<State> = (target, payload) =>
        Effect.suspend(() =>
          Effect.forEach(
            Record.toEntries(named).filter(([, handled]) => Object.is(handled, target)),
            ([name, handled]) => command(name, handled)(payload),
            { discard: true },
          ),
        )

      const react = (
        handled: Action<State, unknown>,
        done: { readonly entry: Entry; readonly next: State },
      ) =>
        Effect.forEach(
          reactionsTo(handled),
          (reaction) => Effect.forkIn(reaction.run(done.entry, done.next, send), scope),
          { discard: true },
        )

      const adopt = (orphan: Orphan) =>
        Record.get(named, orphan.action).pipe(
          Effect.fromOption,
          Effect.flatMap((handled) =>
            handled.attempt(orphan.payload).pipe(
              Effect.flatMap((attempt) =>
                record(orphan.action, handled, orphan.payload, attempt, orphan.key),
              ),
              Effect.map(Option.map((done) => ({ handled, done }))),
            ),
          ),
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
            const attempt = yield* handled.attempt(payload)
            const intent = yield* journal.intend(name, payload)
            const done = yield* Semaphore.withPermit(
              turn,
              journal.exclusively(record(name, handled, payload, attempt, intent)),
            )

            yield* Effect.forEach(Option.toArray(done), (recorded) => react(handled, recorded), {
              discard: true,
            })
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

      const picked = <Picked>(pick: (state: State) => Picked): Reactive<Picked> => {
        const held = Cell.make(pick(shown(cell.read())))

        cell.subscribe((next) => held.write(pick(shown(next))))

        return fromCell(held)
      }
      const select = Struct.map(
        selectors,
        Struct.lambda<ToReactive<State>>((chosen) => picked(chosen.select)),
      )

      Object.entries(select).forEach(([name, reading]) =>
        sourced(Object(reading), `${key} . ${name}`),
      )
      yield* Effect.addFinalizer(() => inspector.forget?.(key) ?? Effect.void)
      yield* inspector.register({
        key,
        base,
        encoded: Effect.flatMap(state.get, (now) =>
          Effect.orDie(Schema.encodeUnknownEffect(Schema.toCodecJson(definition.state))(now)),
        ),
        state,
        log,
        viewing,
        travelTo,
        actions: () =>
          Record.toEntries(named).map(([name, handled]) => ({ name, payload: handled.payload() })),
        hold,
        forkAt,
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
        refused: map(current, (held) => held.refused),
        travelTo,
        select,
        commands,
      }
    }),
  )

const seeded =
  <State, A extends Actions<State>, S extends Selectors<State>>(
    key: string,
    definition: Definition<State, A, S>,
  ): Open<State, never, never> =>
  (leftovers) =>
    Effect.flatMap(Effect.service(Seed), (seed) =>
      inMemory(
        Option.getOrElse(
          Option.flatMap(
            Record.get(seed, key),
            Schema.decodeUnknownOption(Schema.toCodecJson(definition.state)),
          ),
          () => definition.initialState,
        ),
      )(leftovers),
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
      static readonly layer = <const Needs extends ReadonlyArray<unknown> = []>(
        reactions?: Reactions<State, Needs>,
      ) => makeLayer(service, key, definition, listed(reactions), seeded(key, definition))
      static readonly layerFrom = <E, RL, const Needs extends ReadonlyArray<unknown> = []>(
        load: Effect.Effect<State, E, RL>,
        reactions?: Reactions<State, Needs>,
      ) =>
        makeLayer(service, key, definition, listed(reactions), (leftovers) =>
          Effect.flatMap(load, (loaded) => inMemory(loaded)(leftovers)),
        )
      static readonly layerDurable = <const Needs extends ReadonlyArray<unknown> = []>(
        durable: Durable = {},
        reactions?: Reactions<State, Needs>,
      ) =>
        makeLayer(service, key, definition, listed(reactions), onDevice(key, definition, durable))
      static readonly with = <
        Props,
        E = never,
        R = never,
        ViewProps = never,
        const Needs extends ReadonlyArray<unknown> = [],
      >(
        self: Mountable<Props, E, R, ViewProps>,
        reactions?: Reactions<State, Needs>,
      ) =>
        within(
          (place) =>
            Layer.provide(
              makeLayer(
                service,
                `${key} @ ${place}`,
                definition,
                listed(reactions),
                seeded(`${key} @ ${place}`, definition),
              ),
              SecureRandom.layerWebCrypto,
            ),
          key,
        )(self)
    }
  }

export const after = <State, Payload, R>(
  trigger: Action<State, Payload>,
  effect: (payload: Payload, state: State, send: Send<State>) => Effect.Effect<void, never, R>,
): Reaction<State, R> => ({
  action: trigger,
  persist: () => Effect.void,
  run: (entry, state, send) =>
    trigger.decode(entry.payload).pipe(
      Effect.orDie,
      Effect.flatMap((payload) => effect(payload, state, send)),
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
