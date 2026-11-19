import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { SpanBuffer } from "./spans.ts"

export const route = HttpRouter.add(
  "GET",
  "/spans/:traceId",
  Effect.gen(function* () {
    const params = yield* HttpRouter.params
    const buffer = yield* SpanBuffer

    return yield* HttpServerResponse.json(buffer.ofTrace(String(params["traceId"])))
  }),
)

export const recentRoute = HttpRouter.add(
  "GET",
  "/spans",
  SpanBuffer.use((buffer) => HttpServerResponse.json(buffer.recent())),
)
