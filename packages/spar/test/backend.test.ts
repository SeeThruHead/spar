import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Ref, Schema } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { Rpc, RpcGroup } from "effect/rpc"
import { Socket } from "effect/socket"
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

const slowly: typeof fetch = Object.assign(
  () =>
    new Promise<Response>((resolve) => {
      setTimeout(
        () => resolve(new Response("[]", { headers: { "content-type": "application/json" } })),
        20,
      )
    }),
  { preconnect: () => undefined },
)

describe("the same request made twice at once", () => {
  it.live(
    "is reported for the second, and not once the first has landed or for another address",
    () =>
      Effect.gen(function* () {
        const seen = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
        const client = yield* HttpClient.HttpClient
        const noticing = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.provideService(effect, Timeline.Recorder, recording(seen))

        yield* noticing(
          Effect.all(
            [
              client.get("http://backend.test/authors/7"),
              client.get("http://backend.test/authors/7"),
              client.get("http://backend.test/authors/8"),
              client.post("http://backend.test/authors/7"),
              client.post("http://backend.test/authors/7"),
            ],
            { concurrency: "unbounded" },
          ),
        )
        yield* noticing(client.get("http://backend.test/authors/7"))

        expect(
          (yield* Ref.get(seen))
            .filter((call) => call.kind === "noticed")
            .map((call) => [call.name, call.detail]),
        ).toEqual([
          [
            "GET /authors/7",
            {
              code: "SPAR_DUPLICATE_CALL",
              said: "GET http://backend.test/authors/7 was asked for again while the same request was still on its way.",
              in: "",
              at: "",
            },
          ],
        ])
      }).pipe(Effect.provide(Backend.layer), Effect.provideService(FetchHttpClient.Fetch, slowly)),
  )
})

describe("a socket through Backend", () => {
  it.effect("each batch of frames received and sent is an entry in the log", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const written = yield* Ref.make<ReadonlyArray<unknown>>([])
      const plain = Socket.make({
        reader: Effect.succeed({
          pull: Effect.succeed(["one", "two"] as const),
          upgrade: () => Effect.void,
        }),
        writer: Effect.succeed({
          write: (chunk) => Ref.update(written, (all) => [...all, chunk]),
          writeAll: (chunks) => Ref.update(written, (all) => [...all, ...chunks]),
        }),
      })
      const logged = Backend.heard("wss://backend.test/live?room=1", plain)
      const used = Effect.gen(function* () {
        const reader = yield* logged.reader
        const writer = yield* logged.writer

        yield* reader.upgrade()
        yield* writer.write("hello")
        yield* writer.writeAll(["a", "b", "c"])

        return yield* reader.pull
      })
      const frames = yield* Effect.provideService(
        Effect.scoped(used),
        Timeline.Recorder,
        Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
      )

      expect(frames).toEqual(["one", "two"])
      expect(yield* Ref.get(written)).toEqual(["hello", "a", "b", "c"])
      expect((yield* Ref.get(noted)).map((seen) => [seen.kind, seen.name, seen.detail])).toEqual([
        ["call", "socket /live sent", { url: "wss://backend.test/live?room=1", frames: 1 }],
        ["call", "socket /live sent", { url: "wss://backend.test/live?room=1", frames: 3 }],
        ["call", "socket /live received", { url: "wss://backend.test/live?room=1", frames: 2 }],
      ])
      yield* Effect.provideService(
        Effect.scoped(
          Effect.flatMap(Backend.heard("live", plain).writer, (writer) => writer.write("x")),
        ),
        Timeline.Recorder,
        Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
      )
      expect((yield* Ref.get(noted)).at(-1)?.name).toBe("socket live sent")
    }),
  )

  it.effect("the layer gives a socket without dialling until it is read", () =>
    Effect.gen(function* () {
      const made = yield* Effect.service(Socket.Socket)

      expect(Socket.isSocket(made)).toBe(true)
    }).pipe(Effect.provide(Backend.layerSocket("ws://127.0.0.1:1/never"))),
  )
})
