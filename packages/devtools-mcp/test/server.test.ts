import { BunHttpServer, BunServices } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { vi } from "vitest"
import { Effect, Layer, Logger, Queue, References, Schedule, Schema } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { Command } from "effect/cli"
import { SecureRandom } from "effect/crypto"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http"
import { Props, Router, Store, Timeline, UiState, View, compose, uses } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import { jsx } from "spar/jsx-runtime"
import { command, waterfall } from "../src/cli.ts"
import * as Page from "../src/client.ts"
import { changesBetween, layer } from "../src/server.ts"

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

const Note = compose(
  uses(["Tally"]),
  Effect.fnUntraced(function* () {
    const tally = yield* Tally

    return { text: yield* UiState.make("text", Schema.String, "draft"), count: tally.select.count }
  }),
)(NoteView)

const span = (
  name: string,
  parentSpanId: string | null,
  startedAt: number,
  endedAt: number | null,
  attributes: Readonly<Record<string, string>>,
): Spans.Recorded => ({
  name,
  traceId: "t",
  spanId: name,
  parentSpanId,
  startedAt,
  endedAt,
  failed: name === "broke",
  attributes,
})

const headOf = (answer: unknown): string => String(answer).split("\n")[0] ?? ""

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("20 millis") })

const stateOf = (text: unknown): unknown => (typeof text === "string" ? JSON.parse(text) : text)

const pagesOf = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ id: Schema.String, current: Schema.Boolean })),
)

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
        "get_navigation",
        "list_branches",
        "fork",
        "switch_branch",
        "step",
        "count_moments",
        "diff_states",
        "get_actions",
        "run_actions",
        "list_pages",
        "use_page",
        "export_session",
        "load_session",
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

        expect([refused.failed, headOf(refused.said)]).toEqual([
          true,
          "[SPAR_TOOL_NO_UI_STATE] There is no UI state called text there, or the value does not fit its Schema.",
        ])

        yield* mcp.call("load_session", {
          stores: [],
          ui: [{ path: ["NoteView"], name: "text", value: "from a session" }],
        })

        expect((yield* mcp.call("get_ui_state", {})).said).toEqual([
          { path: ["NoteView"], name: "text", value: "from a session" },
        ])
        yield* mcp.call("set_ui_state", { path: ["NoteView"], name: "text", value: "typed" })
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
          [
            "[SPAR_TOOL_NO_COMPONENT] There is no component at Nowhere.",
            "  fix: Call list_components for the ones there are.",
            '  see: LLMS.md, section "SPAR_TOOL_NO_COMPONENT"',
          ].join("\n"),
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

      const session = yield* mcp.call("export_session", {})
      const saved = JSON.parse(JSON.stringify(session.said))

      expect(JSON.stringify(saved)).toContain('"store":"test/Tally"')
      expect(JSON.stringify(saved)).toContain('"by":5')

      yield* tally.commands.added({ by: 100 })

      const replayed = yield* mcp.call("load_session", saved)

      expect([replayed.failed, replayed.said]).toEqual([
        false,
        [{ store: "test/Tally", state: expect.stringMatching(/"count": 6\b/) }],
      ])

      const elsewhere = yield* mcp.call("load_session", {
        stores: [{ store: "test/Missing", entries: [] }],
        ui: [],
      })

      expect([elsewhere.failed, JSON.stringify(elsewhere.said)]).toEqual([
        true,
        expect.stringContaining("SPAR_TOOL_NO_STORE"),
      ])
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live("an agent can step with the trace, fork, switch branches, count and diff", () =>
    Effect.gen(function* () {
      const built = yield* openInspected()
      const tally = yield* Effect.provide(Tally, built)
      const mcp = yield* agent()

      yield* tally.commands.added({ by: 1 })
      yield* tally.commands.added({ by: 2 })
      yield* tally.commands.added({ by: 4 })
      yield* Effect.provide(
        Timeline.note("data", "loaded", () => 1),
        built,
      )

      const counted = yield* until(mcp.call("count_moments", {}), (got) =>
        Bun.inspect(got.said).includes("loaded"),
      )

      expect(counted.said).toEqual([
        { kind: "command", name: "test/Tally/added", count: 3 },
        { kind: "data", name: "loaded", count: 1 },
      ])

      yield* mcp.call("step", { by: -1 })
      yield* mcp.call("step", { by: -1 })

      const stepped = yield* mcp.call("step", { by: -1 })

      expect(stepped.said).toMatchObject({ moment: { seq: 2, name: "test/Tally/added" } })
      expect(Bun.inspect(stepped.said)).toContain("test/Tally/added")
      expect(yield* tally.state.get).toEqual({ count: 3 })

      const forked = yield* mcp.call("fork", {})

      expect(forked.said).toEqual([
        { id: 0, name: "Main", from: null, moments: 4, current: false },
        { id: 1, name: "Fork 1", from: 2, moments: 2, current: true },
      ])

      yield* tally.commands.added({ by: 10 })
      expect(yield* tally.state.get).toEqual({ count: 13 })

      const back = yield* mcp.call("switch_branch", { branch: 0 })

      expect(back.said).toMatchObject([{ current: true }, { current: false, moments: 3 }])
      expect(yield* tally.state.get).toEqual({ count: 7 })
      expect((yield* mcp.call("list_branches", {})).said).toEqual(back.said)

      const actions = yield* mcp.call("get_actions", { store: "test/Tally" })

      expect(actions.said).toMatchObject([{ name: "added" }])
      expect(JSON.stringify(actions.said)).toContain('"by"')

      const several = yield* mcp.call("run_actions", {
        store: "test/Tally",
        actions: [
          { action: "added", payload: { by: 100 } },
          { action: "added", payload: { by: -100 } },
        ],
      })

      expect(stateOf(several.said)).toEqual({ count: 7 })
      expect((yield* mcp.call("get_actions", { store: "none" })).failed).toBe(true)

      const changed = yield* mcp.call("diff_states", { store: "test/Tally", from: 1, to: 3 })

      expect(changed.said).toEqual([{ path: "count", before: 1, after: 7 }])
      expect(yield* tally.viewing.get).toBeNull()

      const present = yield* mcp.call("step", { by: 1 })

      expect(present.said).toEqual({ moment: null, spans: [] })
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it.live("with two pages open an agent can see both and choose which one it speaks to", () =>
    Effect.gen(function* () {
      vi.stubGlobal("location", { href: "http://app.test/people" })

      const first = yield* openPage()
      const second = yield* openPage()
      const mcp = yield* agent()

      yield* first.commands.added({ by: 1 })
      yield* second.commands.added({ by: 20 })

      const listed = yield* until(
        mcp.call("list_pages", {}),
        (got) => Bun.inspect(got.said).includes("current: true") && pagesOf(got.said).length === 2,
      )
      const pages = pagesOf(listed.said)

      vi.unstubAllGlobals()
      expect(Bun.inspect(listed.said)).toContain("http://app.test/people")

      expect(pages).toHaveLength(2)

      const readings = yield* Effect.forEach(pages, (page) =>
        Effect.andThen(
          mcp.call("use_page", { page: page.id }),
          Effect.map(mcp.call("get_state", { store: "test/Tally" }), (got) => stateOf(got.said)),
        ),
      )

      expect(
        readings.toSorted((left, right) => Bun.inspect(left).localeCompare(Bun.inspect(right))),
      ).toEqual([{ count: 1 }, { count: 20 }])

      const [chosen] = pages

      yield* mcp.call("use_page", { page: chosen?.id ?? "" })
      yield* mcp.call("run_action", { store: "test/Tally", action: "added", payload: { by: 300 } })
      expect((yield* first.state.get).count + (yield* second.state.get).count).toBe(321)
      expect((yield* mcp.call("use_page", { page: "nobody" })).failed).toBe(true)

      const after = yield* mcp.call("list_pages", {})

      expect(pagesOf(after.said).filter((page) => page.current)).toHaveLength(1)
    }).pipe(Effect.scoped, Effect.provide(Served)),
  )

  it("the difference between two states is one row for each path that changed", () => {
    const before = { a: 1, b: { c: [1], gone: true }, same: [1, { x: 2 }] }
    const after = { a: 1, b: { c: [1, 2] }, same: [1, { x: 2 }], d: null }

    expect(changesBetween(before, after)).toEqual([
      { path: "b.c", before: [1], after: [1, 2] },
      { path: "b.gone", before: true },
      { path: "d", after: null },
    ])
    expect(changesBetween(1, 2)).toEqual([{ path: "", before: 1, after: 2 }])
  })

  it.live("the same tools answer from a shell", () =>
    Effect.gen(function* () {
      const tally = yield* openPage()
      const url = yield* origin
      const printed = vi.spyOn(console, "log").mockImplementation(() => undefined)
      const last = () => String(printed.mock.calls.at(-1)?.[0])
      const run = Command.runWith(command, { version: "0.0.0" })

      yield* tally.commands.added({ by: 2 })
      yield* run(["tools", "--url", url])
      expect(last()).toContain("list_stores\n  The stores of the open app")

      yield* until(
        Effect.exit(run(["call", "get_state", '{"store":"test/Tally"}', "--url", url])),
        (exit) => exit._tag === "Success",
      )
      expect(stateOf(last())).toEqual({ count: 2 })

      yield* run(["call", "list_branches", "--url", url])
      expect(last()).toContain("Main")

      const missing = yield* Effect.flip(run(["call", "nope", "--url", url]))
      const refused = yield* Effect.flip(
        run(["call", "get_state", '{"store":"none"}', "--url", url]),
      )

      expect(String(missing)).toContain("There is no tool called nope")
      expect(String(refused)).toContain("There is no store called none")
      printed.mockRestore()
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(Served, BunServices.layer))),
  )

  it.live("the newest navigation prints as a waterfall from a shell", () =>
    Effect.gen(function* () {
      const built = yield* openInspected()
      const url = yield* origin
      const printed = vi.spyOn(console, "log").mockImplementation(() => undefined)
      const last = () => String(printed.mock.calls.at(-1)?.[0])
      const run = Command.runWith(command, { version: "0.0.0" })
      const mcp = yield* agent()

      yield* until(mcp.call("list_stores", {}), (answer) =>
        JSON.stringify(answer.said).includes("test/Tally"),
      )
      yield* run(["trace", "--url", url])
      expect(last()).toBe("The app has not changed route yet.")

      const routed = yield* Layer.build(
        Layer.provideMerge(Router.Router.layerMemory("/"), Layer.succeedContext(built)),
      )

      yield* Effect.provide(
        Effect.flatMap(Effect.service(Router.Router), (router) =>
          router.go(Router.route("/there"), {}),
        ),
        routed,
      )

      const found = yield* until(mcp.call("get_navigation", {}), (answer) =>
        JSON.stringify(answer.said).includes("Router.go"),
      )
      const traceId = /"traceId":"([0-9a-f]+)"/.exec(JSON.stringify(found.said))?.[1] ?? ""

      yield* run(["trace", "--url", url])
      expect(last()).toMatch(/^\/there, trace [0-9a-f]+, 1 spans\nRouter\.go {2}\+0\.0 ms {2}/)
      yield* run(["trace", "--url", url, "--id", traceId, "--lens", "stores"])
      expect(last()).toBe(`trace ${traceId}, 0 spans\n`)
      yield* run(["trace", "--url", url, "--back", "3"])
      expect(last()).toBe("The app has not changed route yet.")
      printed.mockRestore()
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(Served, BunServices.layer))),
  )

  it("a waterfall in text nests spans and says what each waited for", () => {
    expect(
      waterfall([
        span("asked", "on click", 12, 13.5, { "spar.query.after": "test/Users . value" }),
        span("on click", null, 10, 20, { "spar.view": "NoteView" }),
        span("served", "on click", 14, null, { "spar.query.served_from": "0123456789abcdef" }),
        span("broke", "asked", 15, 16, {}),
      ]),
    ).toBe(
      [
        "on click  +0.0 ms  10.0 ms  in NoteView",
        "  asked  +2.0 ms  1.5 ms  input from test/Users . value",
        "  served  +4.0 ms  0.0 ms  served from what trace 01234567 loaded",
        "    broke  +5.0 ms  1.0 ms  failed",
      ].join("\n"),
    )
  })

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

      expect([unknownStore.failed, headOf(unknownStore.said)]).toEqual([
        true,
        "[SPAR_TOOL_NO_STORE] There is no store called nope.",
      ])
      expect([unknownAction.failed, headOf(unknownAction.said)]).toEqual([
        true,
        "[SPAR_UNKNOWN_ACTION] The log holds an action this store does not define: renamed",
      ])
      expect([strayStore.failed, headOf(strayStore.said)]).toEqual([
        true,
        "[SPAR_TOOL_NO_STORE] There is no store called nope.",
      ])
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
