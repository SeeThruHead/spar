import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

export class ServerUnreachable extends Schema.TaggedError<
  ServerUnreachable,
  { readonly brand: unique symbol }
>()("ServerUnreachable", {}) {
  override get message() {
    return "The server did not answer. Your change is saved here and will be sent again."
  }
}

export class NoRecord extends Schema.TaggedError<NoRecord, { readonly brand: unique symbol }>()(
  "NoRecord",
  { agent: Schema.String },
) {
  override get message() {
    return `The server has no record of ${this.agent} yet.`
  }
}

export const Started = Schema.Struct({ name: Schema.String, key: Schema.String })

export type Started = typeof Started.Type

export class Agents extends RpcGroup.make(
  Rpc.make("Describe", {
    payload: { name: Schema.String },
    success: Started,
    error: NoRecord,
  }),
  Rpc.make("Start", {
    payload: { name: Schema.String, idempotencyKey: Schema.String },
    error: ServerUnreachable,
  }),
  Rpc.make("Started", { success: Schema.Array(Schema.String) }),
) {}
