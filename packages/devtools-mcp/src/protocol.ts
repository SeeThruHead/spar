import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Store } from "spar"

export const Snapshot = Schema.Struct({
  store: Schema.String,
  state: Schema.String,
  log: Store.Entries,
  viewing: Schema.NullOr(Schema.Int),
})

export type Snapshot = typeof Snapshot.Type

export const Ask = Schema.Union([
  Schema.TaggedStruct("TravelTo", { store: Schema.String, seq: Schema.NullOr(Schema.Int) }),
  Schema.TaggedStruct("Run", {
    store: Schema.String,
    action: Schema.String,
    payload: Schema.Json,
  }),
  Schema.TaggedStruct("Load", { store: Schema.String, entries: Store.Entries }),
])

export type Ask = typeof Ask.Type

export const Command = Schema.Struct({ id: Schema.String, ask: Ask })

export type Command = typeof Command.Type

export class PageRpcs extends RpcGroup.make(
  Rpc.make("Report", { payload: { stores: Schema.Array(Snapshot) } }),
  Rpc.make("Commands", { success: Command, stream: true }),
  Rpc.make("Outcome", { payload: { id: Schema.String, problem: Schema.NullOr(Schema.String) } }),
) {}
