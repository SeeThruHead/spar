import { Context, Effect, Layer, Record, Schema, Struct, SubscriptionRef } from "effect"
import { SecureRandom } from "effect/crypto"
import { provideTo } from "./internal/context.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { Outbox } from "./Outbox.ts"

export type Entry = {
  readonly id: string
  readonly action: string
  readonly payload: Schema.Json
}

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
  readonly resume: (channel: string) => Effect.Effect<Effect.Effect<void, never, R>, never, R>
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

export type Shape<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Reactive<State>
  readonly log: Reactive<ReadonlyArray<Entry>>
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

const makeLayer = <Self, State, A extends Actions<State>, S extends Selectors<State>, R>(
  service: Context.Key<Self, Shape<State, A, S>>,
  key: string,
  definition: Definition<State, A, S>,
  reactions: ReadonlyArray<Reaction<State, R>>,
): Layer.Layer<Self, never, R | SecureRandom.SecureRandom> =>
  Layer.effect(
    service,
    Effect.gen(function* () {
      const { initialState, actions, selectors } = definition
      const random = yield* SecureRandom.SecureRandom
      const context = yield* Effect.context<R>()
      const scope = yield* Effect.scope
      const ref = yield* SubscriptionRef.make({ state: initialState, log: Array.of<Entry>() })
      const current = fromSubscriptionRef(ref)
      const state = map(current, (snapshot) => snapshot.state)
      const reactionsTo = (handled: Action<State, unknown>) =>
        reactions.filter((reaction) => reaction.action === handled)

      const command = (name: string, handled: Action<State, unknown>) =>
        Effect.fn("Store.command")(
          function* (input: unknown) {
            const payload = yield* handled.encode(input)
            const reduce = yield* handled.reducer(payload)
            const id = yield* random.uuidV7()
            const entry: Entry = { id, action: name, payload }

            yield* Effect.forEach(
              reactionsTo(handled),
              (reaction) => reaction.persist(channelOf(key, name), entry),
              { discard: true },
            )

            const next = yield* SubscriptionRef.updateAndGet(ref, (snapshot) => ({
              state: reduce(snapshot.state),
              log: [...snapshot.log, entry],
            }))

            yield* Effect.forEach(
              reactionsTo(handled),
              (reaction) => Effect.forkIn(reaction.run(entry, next.state), scope),
              { discard: true },
            )
          },
          Effect.orDie,
          (effect) => provideTo<void, never, R>(effect, context),
        )

      const resume = (name: string, handled: Action<State, unknown>) =>
        Effect.forEach(
          reactionsTo(handled),
          (reaction) =>
            Effect.flatMap(reaction.resume(channelOf(key, name)), (deliveries) =>
              Effect.forkIn(deliveries, scope),
            ),
          { discard: true },
        )

      const named: Readonly<Record<keyof A & string, Action<State, unknown>>> = actions

      yield* provideTo(
        Effect.forEach(Record.toEntries(named), ([name, handled]) => resume(name, handled), {
          discard: true,
        }),
        context,
      )

      return {
        state,
        log: map(current, (snapshot) => snapshot.log),
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
        makeLayer(service, key, definition, reactions)
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
  resume: () => Effect.succeed(Effect.void),
})

export const outbox = <State, Payload, E, R>(
  trigger: Action<State, Payload>,
  send: (payload: Payload, idempotencyKey: string) => Effect.Effect<void, E, R>,
): Reaction<State, R | Outbox> => {
  const deliver = Effect.fnUntraced(function* (key: string, encoded: Schema.Json) {
    const service = yield* Outbox
    const payload = yield* Effect.orDie(trigger.decode(encoded))

    yield* service.deliver(key, send(payload, key))
  })

  const persist = Effect.fnUntraced(function* (channel: string, entry: Entry) {
    const service = yield* Outbox

    yield* service.persist({ key: entry.id, channel, payload: entry.payload })
  })

  const resume = (channel: string) =>
    Outbox.use((service) => service.persisted(channel)).pipe(
      Effect.map((entries) =>
        Effect.forEach(entries, (entry) => deliver(entry.key, entry.payload), {
          concurrency: "unbounded",
          discard: true,
        }),
      ),
    )

  return { action: trigger, persist, run: (entry) => deliver(entry.id, entry.payload), resume }
}

export class UnknownAction extends Schema.TaggedError<
  UnknownAction,
  { readonly brand: unique symbol }
>()("UnknownAction", { action: Schema.String }) {
  override get message() {
    return `The log holds an action this store does not define: ${this.action}`
  }
}

export const replay = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  Effect.reduce(
    entries,
    () => definition.initialState,
    (state, entry) =>
      Record.get(definition.actions, entry.action).pipe(
        Effect.fromOption,
        Effect.mapError(() => new UnknownAction({ action: entry.action })),
        Effect.flatMap((found) => found.reducer(entry.payload)),
        Effect.map((reduce) => reduce(state)),
      ),
  )
