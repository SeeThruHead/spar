import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Ref, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Reactive, Router, Store, Timeline, UiState, View } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import * as Testing from "spar/testing"
import { DeskView } from "./timeline.tsx"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

class Tally extends Store.Tag<Tally>()("test/Tally", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const next = Router.route("/next")

const Desk = View.connect(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally
    const router = yield* Router.Router

    return {
      count: tally.select.count,
      draft: yield* UiState.make("draft", Schema.String, ""),
      onAdd: tally.commands.added({ by: 1 }),
      onGo: router.go(next, {}),
    }
  }),
)(DeskView)

class Beside extends Store.Tag<Beside>()("test/Beside", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const BesideDesk = Beside.with(
  View.connect(
    Effect.fnUntraced(function* () {
      const beside = yield* Beside
      const router = yield* Router.Router

      return {
        count: beside.select.count,
        draft: yield* UiState.make("draft", Schema.String, ""),
        onAdd: beside.commands.added({ by: 1 }),
        onGo: router.go(next, {}),
      }
    }),
  )(DeskView),
)

const layer = Layer.mergeAll(Tally.layer(), Router.Router.layerMemory("/")).pipe(
  Layer.provideMerge(Devtools.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provideMerge(Layer.sync(UiState.Tree, UiState.makeTree)),
)

const shown = (): ReadonlyArray<string | null> => {
  const draft = screen.getByLabelText("Draft")

  return [
    screen.getByLabelText("Count").textContent,
    draft instanceof HTMLInputElement ? draft.value : null,
  ]
}

const shows = (count: string, draft: string) =>
  Testing.eventually(() => expect(shown()).toEqual([count, draft]))

const recorded = (
  spanId: string,
  parentSpanId: string | null,
  startedAt: number,
  endedAt: number | null,
  failed: boolean,
) => ({
  name: spanId,
  traceId: "t",
  spanId,
  parentSpanId,
  startedAt,
  endedAt,
  failed,
  attributes: {},
})

const made = (attributes: Readonly<Record<string, string>>) => ({
  ...recorded("any", null, 1, 2, false),
  attributes,
})

describe("one log of everything that happened", () => {
  it.live("commands, UI state and route changes are in one order, each with its trace", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Testing.mount(Desk)
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* Testing.click("button", "Add")
      yield* shows("1", "hi")
      yield* Testing.click("button", "Go")
      yield* Timeline.note("data", "threads", () => 3)

      const moments = yield* Effect.repeat(registry.moments.get, {
        until: (all) => all.length === 4,
        schedule: Schedule.spaced("5 millis"),
      })

      expect(
        moments.map((moment) => [moment.seq, moment.kind, moment.name, moment.detail]),
      ).toEqual([
        [1, "ui", "DeskView . draft", "hi"],
        [2, "command", "test/Tally/added", { by: 1 }],
        [3, "route", "/next", "link"],
        [4, "data", "threads", 3],
      ])
      expect(moments.slice(0, 3).every((moment) => moment.traceId.length === 32)).toBe(true)
      expect(moments.slice(0, 3).every((moment) => moment.spanId.length === 16)).toBe(true)
      expect(new Set(moments.map((moment) => moment.traceId)).size).toBe(4)
      expect([moments[3]?.traceId, moments[3]?.spanId]).toEqual(["", ""])
    }).pipe(Effect.provide(layer)),
  )

  it.live("an agent can set a piece of UI state and read every component as plain data", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Effect.acquireRelease(Effect.sync(Devtools.startInspecting), () =>
        Effect.sync(Devtools.stopInspecting),
      )
      expect(Devtools.components(registry.uiState())).toEqual([])
      yield* Testing.mount(Desk)
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* shows("0", "hi")

      expect(registry.setUi(["DeskView"], "draft", "set from outside")).toBe(true)
      expect(registry.setUi(["DeskView"], "draft", 7)).toBe(false)
      yield* shows("0", "set from outside")
      expect(
        Devtools.components([
          ...registry.uiState(),
          { path: ["Other"], name: "elsewhere", value: 1 },
          { path: ["DeskView", "Child"], name: "deeper", value: 2 },
          { path: [], name: "nowhere", value: 3 },
        ]),
      ).toEqual([
        {
          name: "DeskView",
          place: "DeskView",
          services: [],
          recovers: [],
          props: { count: 0, draft: "set from outside", onAdd: "action", onGo: "action" },
          state: { draft: "set from outside" },
        },
      ])
    }).pipe(Effect.provide(layer)),
  )

  it.live("a store beside a view is listed while the view is mounted and not after", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry
      const listed = Effect.map(registry.stores.get, (all) =>
        all.map((store) => store.key).filter((key) => key.startsWith("test/Beside")),
      )

      yield* Effect.scoped(
        Effect.andThen(
          Effect.andThen(Testing.mount(BesideDesk), Testing.find("textbox", "Draft")),
          Effect.flatMap(listed, (keys) =>
            Effect.sync(() => expect(keys).toEqual(["test/Beside @ DeskView"])),
          ),
        ),
      )
      expect(yield* listed).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it("a trace is laid out on one time line, nested by parent, whichever side a span ran on", () => {
    const bars = Devtools.barsOf([
      { span: recorded("open", "inner", 180, null, false), where: "backend" },
      { span: recorded("inner", "root", 120, 150, true), where: "page" },
      { span: recorded("root", null, 100, 200, false), where: "page" },
    ])

    expect(bars).toEqual([
      {
        key: "page root",
        name: "root",
        where: "page",
        took: "100.0 ms",
        failed: false,
        indent: "0px",
        left: "0.00%",
        width: "100.00%",
        note: "",
        waitedFrom: "0.00%",
        waited: "0.00%",
      },
      {
        key: "page inner",
        name: "inner",
        where: "page",
        took: "30.0 ms",
        failed: true,
        indent: "12px",
        left: "20.00%",
        width: "30.00%",
        note: "",
        waitedFrom: "20.00%",
        waited: "0.00%",
      },
      {
        key: "backend open",
        name: "open",
        where: "backend",
        took: "0.0 ms",
        failed: false,
        indent: "24px",
        left: "80.00%",
        width: "0.00%",
        note: "",
        waitedFrom: "80.00%",
        waited: "0.00%",
      },
    ])
    expect(
      Devtools.barsOf([
        {
          span: {
            ...recorded("asked", null, 1, 2, false),
            attributes: { "spar.query.after": "test/Users . value" },
          },
          where: "page",
        },
      ]).map((bar) => bar.note),
    ).toEqual(["input from test/Users . value"])
    expect(
      Devtools.barsOf([
        { span: recorded("whole", null, 0, 100, false), where: "page" },
        { span: recorded("test/Users/requested", "whole", 10, 11, false), where: "page" },
        {
          span: {
            ...recorded("test/Orders/requested", "whole", 60, 61, false),
            attributes: { "spar.query.after": "made from test/Users . value" },
          },
          where: "page",
        },
        {
          span: {
            ...recorded("Lookup", "whole", 62, 90, false),
            attributes: { "spar.query.after": "made from test/Users . value" },
          },
          where: "page",
        },
      ]).map((bar) => [bar.waitedFrom, bar.waited]),
    ).toEqual([
      ["0.00%", "0.00%"],
      ["10.00%", "0.00%"],
      ["10.00%", "50.00%"],
      ["62.00%", "0.00%"],
    ])
    expect(
      ["0123456789abcdef", ""].map(
        (from) =>
          Devtools.barsOf([{ span: made({ "spar.query.served_from": from }), where: "page" }])[0]
            ?.note,
      ),
    ).toEqual(["served from what trace 01234567 loaded", "served from what was loaded"])
    expect(
      Devtools.barsOf([{ span: recorded("only", "elsewhere", 5, 5, false), where: "page" }]).map(
        (bar) => [bar.indent, bar.left, bar.width],
      ),
    ).toEqual([["0px", "0.00%", "0.00%"]])
    expect(Devtools.barsOf([])).toEqual([])
  })

  it("a chain of requests that each waited for the one before is named, with what looks avoidable", () => {
    const asked = (query: string, at: number, after: string, input: string): Spans.Recorded => ({
      ...recorded(`${query}/requested`, null, at, at + 1, false),
      attributes: { "spar.query.after": after, "spar.query.input": input },
    })
    const three = [
      asked("shop/Author", 30, "made from shop/Report . value", '"ada"'),
      asked("shop/Org", 10, "", '"acme"'),
      asked("shop/Report", 20, "shop/Org . value", '"q3"'),
      { ...recorded("Lookup", null, 21, 29, false), attributes: { "spar.query.after": "x" } },
    ]

    expect(Spans.chainsOf(three)).toEqual([
      { requests: ["shop/Org", "shop/Report", "shop/Author"], sameInput: [] },
    ])
    expect(
      Spans.chainsOf([
        asked("shop/Report", 10, "", '"q3"'),
        asked("shop/Author", 20, "shop/Report . value", '"ada"'),
        asked("shop/Stock", 5, "", '"q3"'),
      ]),
    ).toEqual([])
    expect(
      Spans.chainsOf([
        asked("shop/Report", 10, "", '"q3"'),
        asked("shop/Notes", 20, "shop/Report . value", '"q3"'),
        { ...recorded("shop/Old/requested", null, 1, 2, false), attributes: {} },
        { ...asked("shop/Lost", 3, "shop/Missing . value", '"q3"') },
      ]).map(Spans.chainText),
    ).toEqual([
      [
        "[SPAR_QUERY_CHAIN] 2 requests ran one after another: shop/Report, then shop/Notes. shop/Notes had the same input as the request before it, so it did not need that answer to start.",
        "  fix: If a later request does not need the earlier answer, make its input from something that is there already (a route param, a prop, a store), so they start together. If it does need it, have the backend answer both in one call, or preload the page.",
        '  see: LLMS.md, section "SPAR_QUERY_CHAIN"',
      ].join("\n"),
    ])
    expect(Spans.chainText({ requests: ["a", "b", "c"], sameInput: [] })).toContain(
      "3 requests ran one after another: a, then b, then c.\n",
    )
  })

  it("a span belongs to one lens, by what made it", () => {
    expect(Spans.lensOf(made({}), "backend")).toBe("backend")
    expect(Spans.lensOf(made({ "spar.kind": "view" }), "page")).toBe("rendering")
    expect(Spans.lensOf(made({ "spar.kind": "action" }), "page")).toBe("rendering")
    expect(Spans.lensOf(made({ "spar.kind": "data", "spar.store": "q" }), "page")).toBe("data")
    expect(Spans.lensOf(made({ "spar.store": "s" }), "page")).toBe("stores")
    expect(Spans.lensOf(made({}), "page")).toBe("other")
    expect(
      ["all", "stores", "data"].map((lens) =>
        Spans.inLens(lens, made({ "spar.store": "s" }), "page"),
      ),
    ).toEqual([true, true, false])
    expect(["all", "data", "other"].map(Schema.is(Spans.Lens))).toEqual([true, true, false])
  })

  it("what is recorded has a shape that can be checked", () => {
    const moment = { seq: 1, kind: "ui", name: "n", detail: null, traceId: "", spanId: "" }

    expect(["command", "ui", "route", "data", "other"].map(Schema.is(Timeline.Kind))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ])
    expect(Schema.is(Timeline.Moment)(moment)).toBe(true)
    expect(Schema.is(Timeline.Moment)({ ...moment, seq: "1" })).toBe(false)
    expect(Schema.is(Timeline.Noted)({})).toBe(false)
    expect(Schema.is(Timeline.Moment)({})).toBe(false)
    expect(Schema.is(UiState.Entry)({})).toBe(false)
    expect(Schema.is(Devtools.Component)({})).toBe(false)
  })

  it("with inspection off there are no components to read", () => {
    expect(Devtools.components([])).toEqual([])
  })

  it.live("going back to a moment shows the stores and the UI state as they were then", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Testing.mount(Desk)
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* Testing.click("button", "Add")
      yield* shows("1", "hi")
      yield* Testing.fill("textbox", "Draft", "later")
      yield* shows("1", "later")

      const inspector = yield* Store.Inspector
      const sentTo = yield* Ref.make<ReadonlyArray<number | null>>([])

      yield* inspector.register({
        key: "test/Late",
        base: 7,
        encoded: Effect.succeed(null),
        state: Reactive.succeed(null),
        log: Reactive.succeed([]),
        viewing: Reactive.succeed(null),
        travelTo: (seq) => Ref.update(sentTo, (all) => [...all, seq]),
        actions: () => [],
        hold: Effect.succeed(Effect.void),
        forkAt: () => Effect.void,
        load: () => Effect.void,
        run: () => Effect.void,
      })
      yield* registry.travelTo(1)
      yield* shows("0", "hi")
      expect(yield* registry.viewing.get).toBe(1)
      expect(yield* Ref.get(sentTo)).toEqual([7])
      yield* registry.travelTo(2)
      yield* shows("1", "hi")
      yield* registry.travelTo(3)
      yield* shows("1", "later")
      yield* registry.travelTo(1)
      yield* registry.travelTo(null)
      yield* shows("1", "later")
      expect(yield* registry.viewing.get).toBeNull()
      yield* registry.travelTo(1)
      yield* registry.travelTo(99)
      yield* shows("1", "later")
      expect(yield* registry.viewing.get).toBeNull()
    }).pipe(Effect.provide(layer)),
  )
})
