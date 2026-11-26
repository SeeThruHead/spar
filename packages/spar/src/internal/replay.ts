import { Effect, Formatter, Schema } from "effect"
import type { Actions, Recording, Selectors, Step, Tasks, UnknownAction } from "./journal.ts"
import * as Diagnostics from "./said.ts"
import { reducerOf, reducersOf } from "./store.ts"
import type { Definition } from "./store.ts"

export class Diverged extends Schema.TaggedError<Diverged, { readonly brand: unique symbol }>()(
  "Diverged",
  { seq: Schema.Int, action: Schema.String, recorded: Schema.Json, replayed: Schema.Json },
) {
  override get message() {
    return Diagnostics.text("SPAR_REPLAY_DIVERGED", {
      said: `Step ${this.seq} (${this.action}) made a different state. Recorded: ${Formatter.formatJson(this.recorded)}. Replayed: ${Formatter.formatJson(this.replayed)}.`,
    })
  }
}

export class Unreadable extends Schema.TaggedError<Unreadable, { readonly brand: unique symbol }>()(
  "Unreadable",
  { what: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return Diagnostics.text("SPAR_REPLAY_UNREADABLE", {
      said: `The store's schemas no longer read ${this.what}.`,
    })
  }
}

export type Replayable<
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  T extends Tasks<State, Needs>,
  Needs,
> = { readonly definition: Definition<State, A, S, T, Needs> }

const calledAt = (step: Step): string => `step ${step.seq} (${step.action})`

export const replay = <
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  T extends Tasks<State, Needs>,
  Needs,
>(
  store: Replayable<State, A, S, T, Needs>,
  recording: Recording,
): Effect.Effect<State, Diverged | Unreadable | UnknownAction> => {
  const codec = Schema.toCodecJson(store.definition.state)
  const decode = Schema.decodeUnknownEffect(codec)
  const encode = Schema.encodeEffect(codec)
  const same = Schema.toEquivalence(store.definition.state)
  const reducers = reducersOf(store.definition)
  const read = (what: string, json: Schema.Json) =>
    Effect.mapError(decode(json), (cause) => new Unreadable({ what, cause }))
  const stepped = Effect.fnUntraced(function* (now: State, step: Step) {
    const handled = yield* reducerOf(reducers, step.action)
    const reduce = yield* Effect.mapError(
      handled.reducer(step.payload),
      (cause) => new Unreadable({ what: `the payload of ${calledAt(step)}`, cause }),
    )
    const next = reduce(now)
    const recorded = yield* read(`the recorded state of ${calledAt(step)}`, step.state)
    if (same(next, recorded)) return next

    return yield* new Diverged({
      seq: step.seq,
      action: step.action,
      recorded: step.state,
      replayed: yield* Effect.orDie(encode(next)),
    })
  })

  return Effect.flatMap(read("the start state", recording.start), (start) =>
    Effect.reduce(recording.steps, () => start, stepped),
  )
}
