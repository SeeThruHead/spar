import type * as Aggregate from "@alchemy.run/domain/Aggregate"
import { Effect, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import type { Context } from "effect"
import { State } from "spar"

type StateOf<Def extends Aggregate.AnyDefinition> = Def["state"]["Type"]

type Aggregated<Def extends Aggregate.AnyDefinition, Id> = Context.Key<
  Id,
  Aggregate.Client<Def>
> & {
  readonly aggregateName: string
  readonly definition: Def & {
    readonly state: Schema.Codec<StateOf<Def>, Def["state"]["Encoded"]>
  }
}

type CommandOf<Def extends Aggregate.AnyDefinition> = Aggregate.InstanceOf<Def["commands"][number]>

export const tagOf = (value: unknown): ReadonlyArray<string> =>
  typeof value === "object" && value !== null && "_tag" in value && typeof value._tag === "string"
    ? [value._tag]
    : []

type Evolve = Readonly<Record<string, (...args: never[]) => unknown>>

const handlerFor = (evolve: Evolve, event: unknown): ReadonlyArray<(...args: never[]) => unknown> =>
  tagOf(event).flatMap((tag) => (Object.hasOwn(evolve, tag) ? [evolve[tag]] : []))

export const folded = <S, I>(
  evolve: Evolve,
  schema: Schema.Codec<S, I>,
  start: S,
  events: ReadonlyArray<unknown>,
): Effect.Effect<S> =>
  Effect.orDie(
    Schema.decodeUnknownEffect(schema)(
      events.reduce<unknown>(
        (now, event) =>
          handlerFor(evolve, event).reduce<unknown>(
            (state, handler) => Reflect.apply(handler, undefined, [state, event]),
            now,
          ),
        start,
      ),
    ),
  )

type Written = { readonly stream: string; readonly version: number }

type Tagged = { readonly _tag: string }

type CommandOfTag<Cmd extends Tagged, T> = Extract<Cmd, { readonly _tag: T }>

export type Senders<Cmd extends Tagged, R> = {
  readonly [T in Cmd["_tag"]]: (
    input: CommandOfTag<Cmd, T>,
    options: { readonly commandId: string },
  ) => Effect.Effect<Written, R>
}

type SentOf<Def extends Aggregate.AnyDefinition> = Extract<CommandOf<Def>, Tagged>

type Viewed<S, Id, E> = {
  readonly get: (
    key: Id,
    options?: { readonly atLeast?: ReadonlyArray<Written> },
  ) => Effect.Effect<S | null, E>
}

type RejectionsOf<C> = {
  readonly [K in keyof C]: C[K] extends (...args: never[]) => Effect.Effect<unknown, infer X>
    ? X
    : never
}[keyof C]

export type Remote<Def extends Aggregate.AnyDefinition, Id, E, C> = {
  readonly aggregate: Pick<Aggregated<Def, Id>, "aggregateName" | "definition">
  readonly view: Viewed<StateOf<Def>, Id, E>
  readonly commands: C & Senders<SentOf<Def>, RejectionsOf<C>>
}

export const remote = Effect.fnUntraced(function* <Def extends Aggregate.AnyDefinition, Id, E, C>(
  over: Remote<Def, Id, E, C>,
  id: Id,
) {
  const { aggregateName, definition } = over.aggregate
  const state = yield* State.current
  const random = yield* SecureRandom.SecureRandom
  const readAfter = (writes: ReadonlyArray<Written>) =>
    Effect.map(over.view.get(id, { atLeast: writes }), (found) => found ?? definition.initial)
  const first = yield* readAfter([])
  const slot = yield* state.slot([`${aggregateName}/${String(id)}`], definition.state, first)

  const send = <T extends SentOf<Def>["_tag"]>(
    command: CommandOfTag<SentOf<Def>, T> & { readonly _tag: T },
  ) =>
    Effect.flatMap(random.uuidV7(), (commandId) => {
      const senders: Senders<SentOf<Def>, RejectionsOf<C>> = over.commands
      const sender = senders[command._tag]

      return Effect.tap(sender(command, { commandId }), (receipt) =>
        Effect.flatMap(readAfter([receipt]), (now) =>
          slot.set(command._tag, now, { version: receipt.version }),
        ),
      )
    })

  return { state: slot.value, send }
})

export const store = Effect.fnUntraced(function* <Def extends Aggregate.AnyDefinition, Id>(
  aggregate: Aggregated<Def, Id>,
  id: Def["id"]["Type"],
) {
  const client = yield* aggregate
  const state = yield* State.current
  const initial = yield* client.get(id)
  const slot = yield* state.slot(
    [`${aggregate.aggregateName}/${String(id)}`],
    aggregate.definition.state,
    initial,
  )

  const send = <Cmd extends CommandOf<Def>>(command: Cmd) =>
    Effect.tap(client.send(command), (receipt) =>
      Effect.flatMap(slot.value.get, (before) =>
        Effect.flatMap(
          folded(aggregate.definition.evolve, aggregate.definition.state, before, receipt.events),
          (now) =>
            slot.set(tagOf(command).join(""), now, {
              events: receipt.events.flatMap(tagOf),
              version: receipt.version,
            }),
        ),
      ),
    )

  return { state: slot.value, send }
})
