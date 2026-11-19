import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Store, Timeline, UiState } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"

export const Snapshot = Schema.Struct({
  store: Schema.String,
  state: Schema.String,
  log: Store.Entries,
  actions: Schema.Array(Schema.Struct({ name: Schema.String, payload: Schema.Json })),
  viewing: Schema.NullOr(Schema.Int),
})

export type Snapshot = typeof Snapshot.Type

export const Page = Schema.Struct({
  stores: Schema.Array(Snapshot),
  ui: UiState.Snapshot,
  moments: Schema.Array(Timeline.Moment),
  viewing: Schema.NullOr(Schema.Int),
  branches: Schema.Array(Devtools.Branch),
  components: Schema.Array(Devtools.Component),
  spans: Schema.Array(Spans.Recorded),
})

export type Page = typeof Page.Type

export const Ask = Schema.Union([
  Schema.TaggedStruct("Rewind", { seq: Schema.NullOr(Schema.Int) }),
  Schema.TaggedStruct("Fork", {}),
  Schema.TaggedStruct("SwitchTo", { branch: Schema.Int }),
  Schema.TaggedStruct("Step", { by: Schema.Literals([-1, 1]) }),
  Schema.TaggedStruct("SetUi", {
    path: Schema.Array(Schema.String),
    name: Schema.String,
    value: Schema.Json,
  }),
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
  Rpc.make("Report", { payload: { page: Page } }),
  Rpc.make("Commands", { success: Command, stream: true }),
  Rpc.make("Outcome", { payload: { id: Schema.String, problem: Schema.NullOr(Schema.String) } }),
) {}
