import { Effect, Option } from "effect"
import type { Schema } from "effect"
import type { Kept, Trace } from "./uiTree.ts"

export const restoredFromStorage = "restored from storage"

export const fromAnotherTab = "another tab"

export const replacingWholeState: ReadonlyArray<string> = [restoredFromStorage, fromAnotherTab]

export const tracedBy: Effect.Effect<Trace> = Effect.map(
  Effect.option(Effect.currentSpan),
  (span) =>
    Option.match(span, {
      onNone: () => ({ traceId: "", spanId: "" }),
      onSome: (current) => ({ traceId: current.traceId, spanId: current.spanId }),
    }),
)

export const writeTo = <A>(
  kept: Kept<A>,
  name: string,
  next: A,
  payload?: Schema.Json,
): Effect.Effect<void> =>
  Effect.flatMap(tracedBy, (trace) =>
    Effect.flatMap(
      Effect.sync(() =>
        kept.writtenAs(name, next, payload === undefined ? trace : { ...trace, payload }),
      ),
      (logged) =>
        Effect.forEach(
          Option.toArray(logged),
          (seq) => Effect.annotateCurrentSpan("spar.entry", String(seq)),
          { discard: true },
        ),
    ),
  )
