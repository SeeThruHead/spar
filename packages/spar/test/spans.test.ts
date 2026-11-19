import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpRouter } from "effect/http"
import * as Spans from "spar/devtools/spans"

const traced = Effect.gen(function* () {
  const buffer = yield* Spans.SpanBuffer

  yield* Effect.annotateCurrentSpan({ who: "me", tries: 2 })
  yield* Effect.withSpan(Effect.void, "inner")
  yield* Effect.exit(Effect.withSpan(Effect.fail("no"), "broken"))

  const span = yield* Effect.currentSpan

  return { traceId: span.traceId, spanId: span.spanId, during: buffer.ofTrace(span.traceId) }
})

describe("a backend keeps its own spans for the devtools", () => {
  it.live("the spans of one trace come back as plain data, open or ended, failed or not", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(Spans.layer())
      const buffer = Context.get(context, Spans.SpanBuffer)
      const seen = yield* Effect.provide(Effect.withSpan(traced, "outer"), context)
      const after = buffer.ofTrace(seen.traceId)

      expect(seen.during.map((span) => [span.name, span.parentSpanId, span.failed])).toEqual([
        ["outer", null, false],
        ["inner", seen.spanId, false],
        ["broken", seen.spanId, true],
      ])
      expect(seen.during[0]?.endedAt).toBeNull()
      expect(seen.during[0]?.attributes).toEqual({ who: "me", tries: "2" })
      expect(seen.during[1]?.endedAt).toBeTypeOf("number")
      expect(after[0]?.endedAt).toBeGreaterThanOrEqual(after[0]?.startedAt ?? Infinity)
      expect(Schema.is(Schema.Array(Spans.Recorded))(after)).toBe(true)
      expect(buffer.ofTrace("none")).toEqual([])
      expect(buffer.recent()).toEqual(after)
    }),
  )

  it.live("only the newest spans are kept", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(Spans.layer({ keep: 2 }))
      const buffer = Context.get(context, Spans.SpanBuffer)
      const first = yield* Effect.provide(Effect.withSpan(traced, "outer"), context)

      expect(buffer.ofTrace(first.traceId).map((span) => span.name)).toEqual(["inner", "broken"])
    }),
  )

  it.live("a route gives one trace's spans to whoever asks", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(Spans.layer())
      const seen = yield* Effect.provide(Effect.withSpan(traced, "outer"), context)
      const web = yield* Effect.acquireRelease(
        Effect.sync(() => HttpRouter.toWebHandler(Spans.route)),
        (served) => Effect.promise(() => served.dispose()),
      )
      const answer = yield* Effect.promise(() =>
        web.handler(new Request(`http://backend.test/spans/${seen.traceId}`), context),
      )
      const body = yield* Effect.promise(() => answer.json())
      const listed = yield* Schema.decodeUnknownEffect(Schema.Array(Spans.Recorded))(body)
      const none = yield* Effect.promise(() =>
        web.handler(new Request("http://backend.test/spans/unknown"), context),
      )

      expect(listed.map((span) => span.name)).toEqual(["outer", "inner", "broken"])
      expect(yield* Effect.promise(() => none.json())).toEqual([])
    }),
  )
})
