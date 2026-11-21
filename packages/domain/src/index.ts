import type * as Aggregate from "@alchemy.run/domain/Aggregate"
import { Effect } from "effect"
import type { Context, Schema } from "effect"
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
      Effect.flatMap(client.get(id), (now) =>
        slot.set(tagOf(command).join(""), now, {
          events: receipt.events.flatMap(tagOf),
          version: receipt.version,
        }),
      ),
    )

  return { state: slot.value, send }
})
