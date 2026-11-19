import { Context, Effect, Option, Schema } from "effect"

export const Kind = Schema.Literals(["command", "ui", "route", "data", "call"])

export type Kind = typeof Kind.Type

export const Noted = Schema.Struct({
  kind: Kind,
  name: Schema.String,
  detail: Schema.Json,
  traceId: Schema.String,
  spanId: Schema.String,
})

export type Noted = typeof Noted.Type

export const Moment = Schema.Struct({ ...Noted.fields, seq: Schema.Int })

export type Moment = typeof Moment.Type

export const Recorder = Context.Reference<Option.Option<(noted: Noted) => Effect.Effect<void>>>(
  "spar/Timeline/Recorder",
  { defaultValue: Option.none },
)

export const note = (kind: Kind, name: string, detail: () => Schema.Json): Effect.Effect<void> =>
  Effect.flatMap(Effect.service(Recorder), (recorder) => {
    if (Option.isNone(recorder)) return Effect.void

    return Effect.flatMap(Effect.option(Effect.currentSpan), (span) =>
      recorder.value({
        kind,
        name,
        detail: detail(),
        traceId: Option.getOrElse(
          Option.map(span, (found) => found.traceId),
          () => "",
        ),
        spanId: Option.getOrElse(
          Option.map(span, (found) => found.spanId),
          () => "",
        ),
      }),
    )
  })
