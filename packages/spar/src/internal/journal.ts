import { Effect, Schema } from "effect"
import * as Diagnostics from "./said.ts"

export const StoredEntry = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

export type Entry = typeof StoredEntry.Type

export const Entries = Schema.Array(StoredEntry)

export const LogText = Schema.fromJsonString(Entries)

export type Action<State, Payload> = {
  readonly encode: (input: unknown) => Effect.Effect<Schema.Json, Schema.SchemaError>
  readonly schema: Schema.Top
  readonly decode: (payload: Schema.Json) => Effect.Effect<Payload, Schema.SchemaError>
  readonly reducer: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State, Schema.SchemaError>
}

export type Actions<State> = Readonly<Record<string, Action<State, unknown>>>

export type Mode = "switch" | "queue" | "concurrent"

export type Task<State, Payload, Refuses extends string = string, Needs = never> = {
  readonly encode: (input: unknown) => Effect.Effect<Schema.Json, Schema.SchemaError>
  readonly decode: (payload: Schema.Json) => Effect.Effect<Payload, Schema.SchemaError>
  readonly work: (payload: Schema.Json, state: State) => Effect.Effect<Schema.Json, never, Needs>
  readonly finished: (
    result: Schema.Json,
  ) => Effect.Effect<(state: State) => State, Schema.SchemaError>
  readonly mode: Mode
  readonly refuses: ReadonlyArray<Refuses>
}

export type Tasks<State, Needs = never> = Readonly<
  Record<string, Task<State, unknown, string, Needs>>
>
export type Selector<State, A> = {
  readonly schema: Schema.Codec<A, unknown>
  readonly select: (state: State) => A
}

export type Selectors<State> = Readonly<Record<string, Selector<State, unknown>>>

export class UnknownAction extends Schema.TaggedError<
  UnknownAction,
  { readonly brand: unique symbol }
>()("UnknownAction", { action: Schema.String }) {
  override get message() {
    return Diagnostics.text("SPAR_UNKNOWN_ACTION", {
      said: `The log holds an action this store does not define: ${this.action}`,
    })
  }
}
