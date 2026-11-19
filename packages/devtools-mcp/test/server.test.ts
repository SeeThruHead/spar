import { BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Logger, Queue, References, Schedule, Schema } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { SecureRandom } from "effect/crypto"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http"
import { Props, Store, Timeline, UiState, View } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import { jsx } from "spar/jsx-runtime"
import * as Page from "../src/client.ts"
import { layer } from "../src/server.ts"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

class Tally extends Store.Tag<Tally>()("test/Tally", {
  state: State,
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const Served = HttpRouter.serve(layer, { disableLogger: true }).pipe(
  Layer.provideMerge(BunHttpServer.layer({ port: 0, hostname: "127.0.0.1" })),
)

const origin = Effect.map(HttpServer.HttpServer, (server) =>
  HttpServer.formatAddress(server.address),
)

const said = (texts: ReadonlyArray<string>): unknown => JSON.parse(texts.join("") || "null")

const agent = Effect.fnUntraced(function* () {
  const url = yield* origin
  const built = yield* Layer.build(
    McpClient.layerHttp({
      name: "test agent",
      version: "0.0.0",
      url: `${url}/mcp`,
      protocol: McpProtocol.v2025_11_25,
    }).pipe(Layer.provide(FetchHttpClient.layer)),
  )
  const client = yield* Effect.provide(McpClient.McpClient, built)
  const tools = yield* client.listTools()

  return {
    names: tools.map((tool) => tool.name),
    call: (name: string, given: Readonly<Record<string, unknown>>) =>
      Effect.fromNullishOr(tools.find((tool) => tool.name === name)).pipe(
        Effect.flatMap((tool) => client.callTool({ tool, arguments: given })),
        Effect.map((result) => ({
          failed: result.isError === true,
          said: said(result.content.flatMap((part) => (part.type === "text" ? [part.text] : []))),
        })),
      ),
  }
})

const openPage = Effect.fnUntraced(function* () {
  const url = yield* origin
  const built = yield* Layer.build(
    Layer.merge(Tally.layer(), Page.layer({ url })).pipe(
      Layer.provideMerge(Devtools.layer),
      Layer.provide(SecureRandom.layerWebCrypto),
    ),
  )

  return yield* Effect.provide(Tally, built)
})

const openInspected = Effect.fnUntraced(function* () {
  const url = yield* origin

  return yield* Layer.build(
    Layer.merge(Tally.layer(), Page.layer({ url })).pipe(
      Layer.provideMerge(Devtools.layer),
      Layer.provideMerge(Spans.layer()),
      Layer.provideMerge(Layer.sync(UiState.Tree, UiState.makeTree)),
      Layer.provide(SecureRandom.layerWebCrypto),
    ),
  )
})

const NoteView = View.make(
  "NoteView",
  { text: Props.State(Schema.String), count: Props.Reactive(Schema.Finite) },
  ({ text, count }) => jsx("p", { children: [text, count] }),
)

const Note = View.described(["Tally"]).connect(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally

    return { text: yield* UiState.make("text", Schema.String, "draft"), count: tally.select.count }
  }),
)(NoteView)

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("20 millis") })

const stateOf = (text: unknown): unknown => (typeof text === "string" ? JSON.parse(text) : text)

describe("the devtools server for agents", () => {
  it.live("an agent can read an open app's stores and their logs", () =>
    Effect.gen(function* () {
      const tally = yield* openPage()
      const mcp = yield* agent()

      expect(mcp.names).toEqual([
        "list_stores",
        "get_state",
        "get_log",
        "travel_to",
        "run_action",
        "load_log",
        "get_ui_state",
        "set_ui_state",
        "get_timeline",
        "rewind",
        "list_components",
        "get_component",
        "get_trace",
      ])

      yield* tally.commands.added({ by: 1 })
      yield* tally.commands.added({ by: 10 })

      const listed = yield* until(mcp.call("list_stores", {}), (answer) =>
        JSON.stringify(answer.said).includes('"actions":2'),
      )

      expect(listed.said).toEqual([{ store: "test/Tally", viewing: null, actions: 2 }])
      expect(stateOf((yield* mcp.call("get_state", { store: "test/Tally" })).said)).toEqual({
        count: 11,
      })

      const log = yield* mcp.call("get_log", { store: "test/Tally" })
      const newest = yield* mcp.call("get_log", { store: "test/Tally", last: 1 })

      expect(JSON.stringify(log.said)).toContain('"seq":1')
      expect(JSON.stringify(newest.said)).not.toContain('"seq":1')
      expect(JSON.stringify(newest.said)).toContain('"seq":2')
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live(
    "an agent can read and set UI state, read a component, follow a trace and rewind the app",
    () =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(Effect.sync(Devtools.startInspecting), () =>
          Effect.sync(Devtools.stopInspecting),
        )

        const page = yield* openInspected()
        const mcp = yield* agent()

        yield* Effect.provide(Note.mount({}), page)
        yield* Effect.provide(
          Effect.withSpan(
            Tally.use((tally) => tally.commands.added({ by: 2 })),
            "on click",
          ),
          page,
        )
        yield* Effect.provide(
          Tally.use((tally) => tally.commands.added({ by: 5 })),
          page,
        )

        const timeline = yield* until(mcp.call("get_timeline", {}), (answer) =>
          JSON.stringify(answer.said).includes('"seq":2'),
        )
        const moments = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ moments: Schema.Array(Timeline.Moment) }),
        )(timeline.said)
        const first = moments.moments[0]

        expect(moments.moments.map((moment) => [moment.seq, moment.kind, moment.name])).toEqual([
          [1, "command", "test/Tally/added"],
          [2, "command", "test/Tally/added"],
        ])
        expect((yield* mcp.call("get_timeline", { last: 1 })).said).toMatchObject({
          viewing: null,
          moments: [{ seq: 2 }],
        })
        expect((yield* mcp.call("get_ui_state", {})).said).toEqual([
          { path: ["NoteView"], name: "text", value: "draft" },
        ])
        expect(
          (yield* mcp.call("set_ui_state", { path: ["NoteView"], name: "text", value: "typed" }))
            .said,
        ).toEqual([{ path: ["NoteView"], name: "text", value: "typed" }])

        const refused = yield* mcp.call("set_ui_state", {
          path: ["NoteView"],
          name: "text",
          value: 5,
        })

        expect([refused.failed, refused.said]).toEqual([
          true,
          "There is no UI state called text there, or the value does not fit its Schema.",
        ])
        expect((yield* mcp.call("list_components", {})).said).toEqual([
          { name: "NoteView", place: "NoteView" },
        ])
        expect((yield* mcp.call("list_components", { name: "Other" })).said).toEqual([])
        expect((yield* mcp.call("get_component", { place: "NoteView" })).said).toEqual({
          name: "NoteView",
          place: "NoteView",
          services: ["Tally"],
          recovers: [],
          props: { text: "typed", count: 7 },
          state: { text: "typed" },
        })

        const nowhere = yield* mcp.call("get_component", { place: "Nowhere" })

        expect([nowhere.failed, nowhere.said]).toEqual([
          true,
          "There is no component at Nowhere. list_components gives the ones there are.",
        ])

        const trace = yield* mcp.call("get_trace", { traceId: first?.traceId ?? "" })

        expect(JSON.stringify(trace.said)).toContain('"name":"on click"')
        expect(JSON.stringify(trace.said)).toContain('"name":"test/Tally/added"')
        expect((yield* mcp.call("get_trace", { traceId: "none" })).said).toEqual([])
        expect((yield* mcp.call("rewind", { seq: 1 })).said).toBe(1)
        expect(stateOf((yield* mcp.call("get_state", { store: "test/Tally" })).said)).toEqual({
          count: 2,
        })
        expect((yield* mcp.call("rewind", { seq: null })).said).toBeNull()
        expect(stateOf((yield* mcp.call("get_state", { store: "test/Tally" })).said)).toEqual({
          count: 7,
        })
      }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live("an agent can run an action, step back through the log, and load another log", () =>
    Effect.gen(function* () {
      const tally = yield* openPage()
      const mcp = yield* agent()

      yield* tally.commands.added({ by: 1 })

      const ran = yield* mcp.call("run_action", {
        store: "test/Tally",
        action: "added",
        payload: { by: 5 },
      })

      expect([ran.failed, stateOf(ran.said)]).toEqual([false, { count: 6 }])
      expect(yield* tally.state.get).toEqual({ count: 6 })

      const earlier = yield* mcp.call("travel_to", { store: "test/Tally", seq: 1 })

      expect(stateOf(earlier.said)).toEqual({ count: 1 })
      expect(yield* tally.viewing.get).toBe(1)

      const loaded = yield* mcp.call("load_log", {
        store: "test/Tally",
        entries: [{ id: "a", action: "added", payload: { by: 40 }, seq: 1 }],
      })

      expect(stateOf(loaded.said)).toEqual({ count: 40 })

      const live = yield* mcp.call("travel_to", { store: "test/Tally", seq: null })

      expect(stateOf(live.said)).toEqual({ count: 6 })
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live("what an agent asks for that cannot be done comes back as a plain reason", () =>
    Effect.gen(function* () {
      yield* openPage()

      const mcp = yield* agent()

      yield* until(mcp.call("list_stores", {}), (answer) =>
        JSON.stringify(answer.said).includes("test/Tally"),
      )

      const unknownStore = yield* mcp.call("get_state", { store: "nope" })
      const unknownAction = yield* mcp.call("run_action", {
        store: "test/Tally",
        action: "renamed",
        payload: {},
      })
      const strayStore = yield* mcp.call("travel_to", { store: "nope", seq: null })

      expect([unknownStore.failed, unknownStore.said]).toEqual([
        true,
        "There is no store called nope. list_stores gives the ones there are.",
      ])
      expect([unknownAction.failed, unknownAction.said]).toEqual([
        true,
        "The log holds an action this store does not define: renamed",
      ])
      expect([strayStore.failed, strayStore.said]).toEqual([true, "There is no store called nope."])
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live(
    "a page whose devtools server is not running keeps trying and says so only when asked",
    () =>
      Effect.gen(function* () {
        const logged = yield* Queue.unbounded<string>()
        const listening = Logger.make<unknown, void>(({ message }) => {
          Queue.offerUnsafe(logged, String(message))
        })

        yield* Layer.build(
          Layer.merge(Tally.layer(), Page.layer({ url: "http://127.0.0.1:9" })).pipe(
            Layer.provideMerge(Devtools.layer),
            Layer.provide(SecureRandom.layerWebCrypto),
            Layer.provide(Logger.layer([listening])),
            Layer.provide(Layer.succeed(References.MinimumLogLevel, "Debug")),
          ),
        )

        expect(yield* Queue.take(logged)).toContain("The devtools link stopped")
      }).pipe(Effect.scoped),
  )

  it.live(
    "with no app open, asking for something to be done says so instead of hanging",
    () =>
      Effect.gen(function* () {
        const mcp = yield* agent()
        const nobody = yield* mcp.call("travel_to", { store: "test/Tally", seq: null })

        expect((yield* mcp.call("list_stores", {})).said).toEqual([])
        expect([nobody.failed, nobody.said]).toEqual([
          true,
          "No page answered. Open the app with the devtools link turned on.",
        ])
      }).pipe(Effect.scoped, Effect.provide(Served)),
    15_000,
  )
})
