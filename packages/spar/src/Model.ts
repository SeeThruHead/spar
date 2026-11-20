import { Context, Effect, Layer, Option, Record, Schema, Struct } from "effect"
import type { Scope } from "effect"
import type { Action, Actions, Selectors } from "./internal/journal.ts"
import { map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import * as State from "./State.ts"
import { Inspector } from "./Store.ts"
import type { ToReactive } from "./Store.ts"
import type { Mountable } from "./View.ts"
import { within } from "./View.ts"

type PayloadOf<A> = A extends {
  readonly decode: (payload: Schema.Json) => Effect.Effect<infer Payload, Schema.SchemaError>
}
  ? Payload
  : never

export type Definition<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Schema.Codec<State, unknown>
  readonly initialState: State
  readonly actions: A
  readonly selectors: S
}

export type Shape<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Reactive<State>
  readonly select: { readonly [Name in keyof S]: Struct.Apply<ToReactive<State>, S[Name]> }
  readonly commands: {
    readonly [Name in keyof A & string]: (payload: PayloadOf<A[Name]>) => Effect.Effect<void>
  }
}

const made = Effect.fnUntraced(function* <
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  E,
  R,
>(
  key: string,
  definition: Definition<State, A, S>,
  start: Effect.Effect<State, E, R>,
): Effect.fn.Return<Shape<State, A, S>, E, R | Scope.Scope> {
  const state = yield* State.current
  const initial = yield* start
  const slot = yield* state.slot([key], definition.state, initial)
  const named: Readonly<Record<keyof A & string, Action<State, unknown>>> = definition.actions
  const run = (name: string, handled: Action<State, unknown>, payload: Schema.Json) =>
    Effect.flatMap(Effect.orDie(handled.reducer(payload)), (reduce) =>
      slot.update(name, reduce, payload),
    )
  const commands = Record.map(
    named,
    (handled, name) => (input: unknown) =>
      Effect.withSpan(
        Effect.flatMap(Effect.orDie(handled.encode(input)), (payload) =>
          run(name, handled, payload),
        ),
        `${key}/${name}`,
        { captureStackTrace: false, attributes: { "spar.store": key, "spar.action": name } },
      ),
  )
  const select = Struct.map(
    definition.selectors,
    Struct.lambda<ToReactive<State>>((chosen) => slot.pick(chosen.select)),
  )
  const inspector = yield* Inspector
  const encodeState = Schema.encodeEffect(Schema.toCodecJson(definition.state))

  yield* inspector.register({
    key,
    base: 0,
    encoded: Effect.orDie(Effect.flatMap(slot.value.get, encodeState)),
    state: slot.value,
    log: map(state.log, (written) =>
      written
        .filter((entry) => entry.path.length === 0 && entry.slot === key)
        .map((entry) => ({
          id: String(entry.seq),
          action: entry.name,
          payload: entry.payload ?? null,
          seq: entry.seq,
        })),
    ),
    viewing: state.viewing,
    travelTo: state.travelTo,
    actions: () =>
      Record.toEntries(named).map(([name, handled]) => ({ name, schema: handled.schema })),
    hold: Effect.succeed(Effect.void),
    forkAt: (seq) => Effect.andThen(state.travelTo(seq), state.fork),
    load: (entries) =>
      Effect.andThen(
        slot.set("loaded", definition.initialState),
        Effect.forEach(
          entries,
          (entry) =>
            Effect.forEach(Option.toArray(Record.get(named, entry.action)), (handled) =>
              run(entry.action, handled, entry.payload),
            ),
          { discard: true },
        ),
      ),
    run: (name, payload) =>
      Effect.forEach(
        Option.toArray(Record.get(named, name)),
        (handled) => run(name, handled, payload),
        {
          discard: true,
        },
      ),
  })

  return { state: slot.value, select, commands }
})

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
      static readonly layer = Layer.effect(
        service,
        made(key, definition, Effect.succeed(definition.initialState)),
      )
      static readonly layerFrom = <E, R>(load: Effect.Effect<State, E, R>) =>
        Layer.effect(service, made(key, definition, load))
      static readonly layerSaved = Layer.effect(
        service,
        made(key, definition, Effect.succeed(definition.initialState)),
      ).pipe(Layer.provide(State.saved))
      static readonly with = <Props, E = never, R = never, ViewProps = never>(
        self: Mountable<Props, E, R, ViewProps>,
      ) =>
        within(
          (place) =>
            Layer.effect(
              service,
              made(`${key} @ ${place}`, definition, Effect.succeed(definition.initialState)),
            ),
          key,
        )(self)
    }
  }
