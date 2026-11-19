import { Schema } from "effect"
import { Snapshot } from "./uiTree.ts"

export const Dehydrated = Schema.Struct({
  stores: Schema.Record(Schema.String, Schema.Json),
  ui: Snapshot,
  trace: Schema.NullOr(Schema.Struct({ traceId: Schema.String, spanId: Schema.String })),
  pieces: Schema.optional(Schema.Boolean),
})

export type Dehydrated = typeof Dehydrated.Type

export const stateId = "spar-state"

export const Text = Schema.fromJsonString(Dehydrated)
