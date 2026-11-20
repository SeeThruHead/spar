import { Data, Effect, Option, Record, Schema, Stream } from "effect"
import * as Diagnostics from "./said.ts"

export const StoredEntry = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Json,
  seq: Schema.Int,
})

export const Intent = Schema.Struct({ action: Schema.String, payload: Schema.Json })

export type Orphan = typeof Intent.Type & { readonly key: string }

export type Entry = typeof StoredEntry.Type

export const Entries = Schema.Array(StoredEntry)

export const LogText = Schema.fromJsonString(Entries)

export class Refused extends Data.TaggedClass("Refused")<{ readonly reason: string }> {}

export type Action<State, Payload> = {
  readonly encode: (input: unknown) => Effect.Effect<Schema.Json, Schema.SchemaError>
  readonly schema: Schema.Top
  readonly decode: (payload: Schema.Json) => Effect.Effect<Payload, Schema.SchemaError>
  readonly attempt: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State | Refused, Schema.SchemaError>
  readonly reducer: (
    payload: Schema.Json,
  ) => Effect.Effect<(state: State) => State, Schema.SchemaError>
}

export type Durable = { readonly compactAfter?: number }

export type Actions<State> = Readonly<Record<string, Action<State, unknown>>>

export type Selector<State, A> = {
  readonly schema: Schema.Codec<A, unknown>
  readonly select: (state: State) => A
}

export type Selectors<State> = Readonly<Record<string, Selector<State, unknown>>>

export type Step<State> = { readonly seq: number; readonly state: State }

export type Transition<State> = {
  readonly before: State
  readonly after: State
  readonly action: string
  readonly payload: Schema.Json
}

export type Rules<State> = {
  readonly invariants?: Readonly<Record<string, (state: NoInfer<State>) => boolean>>
  readonly transitions?: Readonly<Record<string, (step: Transition<NoInfer<State>>) => boolean>>
}

export type Definition<State, A extends Actions<State>, S extends Selectors<State>> = {
  readonly state: Schema.Codec<State, unknown>
  readonly initialState: State
  readonly actions: A
  readonly selectors: S
  readonly invariants?: Readonly<Record<string, (state: NoInfer<State>) => boolean>>
  readonly transitions?: Readonly<Record<string, (step: Transition<NoInfer<State>>) => boolean>>
  readonly phases?: Phases<NoInfer<State>, keyof NoInfer<A> & string>
}

export type Phases<State, Name extends string> = {
  readonly of: (state: State) => string
  readonly accepts: Readonly<Record<string, ReadonlyArray<Name>>>
  readonly internal?: ReadonlyArray<Name>
}

export const unfitFor = <State>(
  phases: Phases<State, string> | undefined,
  state: State,
  action: string,
  fromItsOwnEffect: boolean,
): string | null => {
  if (phases === undefined) return null
  if (phases.internal?.includes(action) === true && !fromItsOwnEffect) {
    return "it is internal to the store: only the store's own effects may send it"
  }

  const phase = phases.of(state)

  return phases.accepts[phase]?.includes(action) === true
    ? null
    : `it is not accepted while ${phase}`
}

export const brokenBy = <State>(rules: Rules<State>, step: Transition<State>): string | null => {
  const broken = [
    ...Object.entries(rules.invariants ?? {}).filter(([, holds]) => !holds(step.after)),
    ...Object.entries(rules.transitions ?? {}).filter(([, holds]) => !holds(step)),
  ]

  return broken[0]?.[0] ?? null
}

export type Journal<State> = {
  readonly base: State
  readonly state: State
  readonly entries: ReadonlyArray<Entry>
  readonly lastSeq: number
  readonly append: (entry: Entry, next: State) => Effect.Effect<void>
  readonly news: (applied: number) => Effect.Effect<News<State>>
  readonly exclusively: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly tell: Effect.Effect<void>
  readonly told: Stream.Stream<void>
  readonly intend: (action: string, payload: Schema.Json) => Effect.Effect<string>
  readonly settle: (intent: string) => Effect.Effect<void>
  readonly orphans: Effect.Effect<ReadonlyArray<Orphan>>
}

type News<State> = {
  readonly restart: Option.Option<State>
  readonly entries: ReadonlyArray<Entry>
  readonly lastSeq: number
}

export type Open<State, E, R> = (
  leftovers: ReadonlyArray<Entry>,
) => Effect.Effect<Journal<State>, E, R>

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

export class Unreadable extends Schema.TaggedError<Unreadable, { readonly brand: unique symbol }>()(
  "Unreadable",
  { store: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return Diagnostics.text("SPAR_UNREADABLE_SAVE", {
      said: `What was saved for ${this.store} on this device could not be read. Clear it or read it with the version that wrote it.`,
    })
  }
}

export const lastSeqOf = (entries: ReadonlyArray<Entry>, otherwise: number): number =>
  entries.reduce((last, entry) => Math.max(last, entry.seq), otherwise)

export const replayFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  start: State,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  Effect.reduce(
    entries,
    () => start,
    (state, entry) =>
      Record.get(definition.actions, entry.action).pipe(
        Effect.fromOption,
        Effect.mapError(() => new UnknownAction({ action: entry.action })),
        Effect.flatMap((found) => found.reducer(entry.payload)),
        Effect.map((reduce) => reduce(state)),
      ),
  )

export const stepsFrom = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  start: State,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<ReadonlyArray<Step<State>>, Schema.SchemaError | UnknownAction> =>
  Effect.map(
    Effect.reduce(
      entries,
      (): { readonly state: State; readonly steps: ReadonlyArray<Step<State>> } => ({
        state: start,
        steps: [],
      }),
      (reached, entry) =>
        Effect.map(replayFrom(definition, reached.state, [entry]), (state) => ({
          state,
          steps: [...reached.steps, { seq: entry.seq, state }],
        })),
    ),
    (reached) => reached.steps,
  )

export const replay = <State, A extends Actions<State>, S extends Selectors<State>>(
  definition: Definition<State, A, S>,
  entries: ReadonlyArray<Entry>,
): Effect.Effect<State, Schema.SchemaError | UnknownAction> =>
  replayFrom(definition, definition.initialState, entries)

export const nothingNew = <State>(applied: number): News<State> => ({
  restart: Option.none(),
  entries: [],
  lastSeq: applied,
})

export const inMemory =
  <State>(initialState: State): Open<State, never, never> =>
  () =>
    Effect.succeed({
      base: initialState,
      state: initialState,
      entries: [],
      lastSeq: 0,
      append: () => Effect.void,
      news: (applied) => Effect.succeed(nothingNew(applied)),
      exclusively: (effect) => effect,
      tell: Effect.void,
      told: Stream.empty,
      intend: () => Effect.succeed(""),
      settle: () => Effect.void,
      orphans: Effect.succeed([]),
    })
