import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Ref, Schema } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { Rpc, RpcGroup } from "effect/rpc"
import { Backend, Timeline } from "spar"

class Greetings extends RpcGroup.make(
  Rpc.make("Greet", { payload: { name: Schema.String }, success: Schema.String }),
) {}

const exit = JSON.stringify({
  _tag: "Exit",
  requestId: 0,
  exit: { _tag: "Success", value: "Hello Ada" },
})

const addressOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input

  return input instanceof URL ? input.href : input.url
}

const answering: typeof fetch = Object.assign(
  (input: RequestInfo | URL) =>
    addressOf(input).includes("/rpc")
      ? Promise.resolve(
          new Response(`${exit}\n`, { headers: { "content-type": "application/x-ndjson" } }),
        )
      : Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" } })),
  { preconnect: () => undefined },
)

const recording = (seen: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Option.some((noted: Timeline.Noted) => Ref.update(seen, (all) => [...all, noted]))

describe("Backend", () => {
  it.live("an RPC goes through the one client, and the call is noted with its trace", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const greetings = yield* Backend.rpc(Greetings, "http://backend.test/rpc")
      const said = yield* greetings
        .Greet({ name: "Ada" })
        .pipe(Effect.withSpan("asking"), Effect.provideService(Timeline.Recorder, recording(seen)))
      const noted = yield* Ref.get(seen)

      expect(said).toBe("Hello Ada")
      expect(noted.map((call) => [call.kind, call.name, call.detail])).toEqual([
        ["call", "POST /rpc/", { method: "POST", url: "http://backend.test/rpc/" }],
      ])
      expect(noted[0]?.traceId).toHaveLength(32)
    }).pipe(Effect.provide(Backend.layer), Effect.provideService(FetchHttpClient.Fetch, answering)),
  )

  it.live("a plain request through the same client is noted too, whatever its address", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const client = yield* HttpClient.HttpClient

      yield* client
        .get("http://backend.test/things?page=2")
        .pipe(Effect.provideService(Timeline.Recorder, recording(seen)))
      yield* Effect.ignore(
        client.get("/relative").pipe(Effect.provideService(Timeline.Recorder, recording(seen))),
      )

      expect((yield* Ref.get(seen)).map((call) => call.name)).toEqual([
        "GET /things",
        "GET /relative",
      ])
    }).pipe(Effect.provide(Backend.layer), Effect.provideService(FetchHttpClient.Fetch, answering)),
  )
})
