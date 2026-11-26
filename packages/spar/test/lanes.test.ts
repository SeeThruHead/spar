import { describe, expect, it } from "@effect/vitest"
import type { Schema } from "effect"
import {
  aboutSpan,
  acrossLanes,
  changeLines,
  changesText,
  eventShown,
  lanesOf,
  seqAt,
  backgroundOf,
  isShortcut,
  fieldChanges,
  summaryOfMoment,
  ticksDrawn,
  waitBefore,
} from "../src/Devtools.ts"
import type { Moment } from "../src/Timeline.ts"

const moment = (seq: number, kind: Moment["kind"], name: string): Moment => ({
  seq,
  kind,
  name,
  detail: null,
  traceId: "",
  spanId: "",
})

const session: ReadonlyArray<Moment> = [
  moment(1, "route", "/"),
  moment(2, "command", "sidebar/Board/started"),
  moment(3, "ui", "Shell / Sidebar . filter"),
  moment(4, "call", "POST /rpc/"),
  moment(5, "command", "sidebar/Board/renamed"),
  moment(6, "data", "people"),
]

const colourOf = (kind: string) =>
  ticksDrawn([{ seq: 1, kind, at: "0%" }])
    .slice("linear-gradient(".length, -1)
    .split(",")[0]

const surface = (left: number, width: number, clientX: number) => ({
  clientX,
  currentTarget: { getBoundingClientRect: () => ({ left, width }) },
})

describe("an event's row", () => {
  it("shows a call by its name alone, an event with nothing more by its name, and cuts long detail", () => {
    expect(
      summaryOfMoment({ ...moment(1, "call", "POST /rpc/"), detail: { method: "POST" } }),
    ).toBe("POST /rpc/")
    expect(summaryOfMoment(moment(2, "command", "a/b"))).toBe("a/b")
    expect(summaryOfMoment({ ...moment(3, "ui", "Shell . draft"), detail: "x".repeat(100) })).toBe(
      `Shell . draft "${"x".repeat(78)}…`,
    )
  })
})

const recordedSpan = (
  spanId: string,
  parentSpanId: string | null,
  startedAt: number,
  endedAt: number,
) => ({
  name: spanId,
  traceId: "t",
  spanId,
  parentSpanId,
  startedAt,
  endedAt,
  failed: false,
  attributes: {},
})

describe("a wait between spans", () => {
  const deliver = recordedSpan("deliver", null, 0, 380)
  const first = recordedSpan("try 1", "deliver", 5, 62)
  const second = recordedSpan("try 2", "deliver", 312, 368)
  const all = [deliver, first, second].map((each) => ({ span: each, where: "page" as const }))

  it("is named on the span that came after it, when it is long enough to be deliberate", () => {
    expect(waitBefore(second, all)).toBe("after a 250 ms wait")
    expect(waitBefore(first, all)).toBe("")
    expect(waitBefore(deliver, all)).toBe("")
    expect(waitBefore(recordedSpan("close", "deliver", 70, 71), all)).toBe("")
  })

  it("counts from the nearest sibling that ended before it, and only siblings under the same parent", () => {
    const later = recordedSpan("later", "deliver", 100, 110)
    const siblings = (ends: ReadonlyArray<readonly [string, string | null, number]>) =>
      [later, ...ends.map(([id, parent, end]) => recordedSpan(id, parent, end - 5, end))].map(
        (each) => ({ span: each, where: "page" as const }),
      )

    expect(
      waitBefore(
        later,
        siblings([
          ["far", "deliver", 10],
          ["near", "deliver", 60],
        ]),
      ),
    ).toBe("after a 40 ms wait")
    expect(waitBefore(later, siblings([["other", "elsewhere", 10]]))).toBe("")
    expect(
      waitBefore(
        later,
        siblings([
          ["early", "deliver", 50],
          ["touching", "deliver", 100],
        ]),
      ),
    ).toBe("")
    expect(waitBefore(later, siblings([["just", "deliver", 80]]))).toBe("after a 20 ms wait")
    expect(waitBefore(later, siblings([["short", "deliver", 81]]))).toBe("")
    expect(waitBefore(later, [{ span: later, where: "page" as const }])).toBe("")
  })
})

describe("a devtools shortcut", () => {
  it("needs Alt and Shift together", () => {
    expect(
      [
        { altKey: true, shiftKey: true },
        { altKey: true, shiftKey: false },
        { altKey: false, shiftKey: true },
      ].map(isShortcut),
    ).toEqual([true, false, false])
  })
})

describe("what an action changed in a store", () => {
  it("names each field that changed, from before to after, and only those", () => {
    expect(
      fieldChanges(
        { count: 1, phase: "idle", gone: true },
        { count: 2, phase: "idle", added: "x" },
      ),
    ).toEqual(["count: 1 → 2", "gone: true → (absent)", 'added: (absent) → "x"'])
  })

  it("compares a value that is not a record as a whole", () => {
    expect(fieldChanges(1, 2)).toEqual(["1 → 2"])
    expect(fieldChanges([1], [1])).toEqual([])
    expect(fieldChanges({ count: 1 }, { count: 1 })).toEqual([])
  })
})

describe("background work", () => {
  it("is said on the outbox's delivery, and on nothing else", () => {
    expect(backgroundOf({ "spar.background": "outbox" })).toBe(
      "in the background: the click was done when it was saved",
    )
    expect(backgroundOf({})).toBe("")
  })
})

describe("a picked span", () => {
  it("is shown with its timing, its place in the trace and every attribute", () => {
    const span = {
      name: "Agents.start",
      traceId: "t",
      spanId: "s2",
      parentSpanId: "s1",
      startedAt: 10,
      endedAt: 60.8,
      failed: true,
      attributes: { "rpc.method": "Agents.start" },
    }

    expect(aboutSpan(span, "backend")).toBe(
      "Agents.start\nbackend · 50.8 ms · failed\nspan    s2\nparent  s1\ntrace   t\n\nrpc.method  Agents.start",
    )
    expect(
      aboutSpan(
        { ...span, parentSpanId: null, failed: false, endedAt: null, attributes: {} },
        "page",
      ),
    ).toBe(
      "Agents.start\npage · 0.0 ms\nspan    s2\nparent  none, it starts the trace\ntrace   t\n",
    )
  })
})

const ui = (path: ReadonlyArray<string>, name: string, value: Schema.Json) => ({
  path,
  name,
  value,
})

describe("what an event changed", () => {
  it("lists stores that moved, UI state that changed, came or went", () => {
    const before = {
      ui: [ui(["Shell", "Sidebar"], "filter", ""), ui(["Shell", "Menu"], "open", true)],
      stores: { "sidebar/Board": 4, "spar/ui/Toasts": 2 },
    }
    const now = {
      ui: [ui(["Shell", "Sidebar"], "filter", "tri"), ui(["Shell", "Dialog"], "draft", "")],
      stores: { "sidebar/Board": 5, "spar/ui/Toasts": 2, "sidebar/People": 1 },
    }

    expect(changeLines(before, now)).toEqual([
      "sidebar/Board  entry 4 → 5",
      "sidebar/People  entry none → 1",
      'Shell / Sidebar . filter  "" → "tri"',
      '+ Shell / Dialog . draft  ""',
      "- Shell / Menu . open",
    ])
  })

  it("for the first event, everything is new", () => {
    expect(changeLines(undefined, { ui: [ui([], "x", 1)], stores: { a: 1 } })).toEqual([
      "a  entry none → 1",
      "+ x  1",
    ])
  })

  it("says so when nothing changed", () => {
    expect(changesText([])).toBe("Nothing in the state changed.")
    expect(changesText(["a", "b"])).toBe("a\nb")
  })
})

describe("the event panel", () => {
  it("shows the newest event while the app is live, the chosen one while looking back", () => {
    const traced = {
      ...moment(7, "command", "a/added"),
      detail: { by: 1 },
      traceId: "t1",
      spanId: "s1",
    }

    expect(eventShown([moment(6, "ui", "x . y"), traced], null)).toEqual({
      heading: "#7 a/added",
      kind: "command",
      detail: '{\n  "by": 1\n}',
      traceId: "t1",
      spanId: "s1",
    })
    expect(eventShown([moment(6, "ui", "x . y"), traced], 6).heading).toBe("#6 x . y")
    expect(eventShown([moment(6, "ui", "x . y")], 6).detail).toBe("")
    expect(eventShown(session, null).heading).toBe("#6 people")
    expect(eventShown(session, 42).heading).toBe("No event yet")
  })

  it("says so when nothing has happened yet", () => {
    expect(eventShown([], null)).toEqual({
      heading: "No event yet",
      kind: "",
      detail: "",
      traceId: "",
      spanId: "",
    })
  })
})

describe("the lanes", () => {
  it("are one row per slot, in the order slots first appear, each event placed by its order", () => {
    expect(lanesOf(session)).toEqual([
      { slot: "router", ticks: [{ seq: 1, kind: "route", at: "0.00%" }] },
      {
        slot: "sidebar/Board",
        ticks: [
          { seq: 2, kind: "command", at: "20.00%" },
          { seq: 5, kind: "command", at: "80.00%" },
        ],
      },
      { slot: "Shell / Sidebar", ticks: [{ seq: 3, kind: "ui", at: "40.00%" }] },
      { slot: "calls", ticks: [{ seq: 4, kind: "call", at: "60.00%" }] },
      { slot: "people", ticks: [{ seq: 6, kind: "data", at: "100.00%" }] },
    ])
  })

  it("put a single event in the middle", () => {
    expect(lanesOf([moment(9, "command", "a/b")])[0]?.ticks[0]?.at).toBe("50.00%")
  })

  it("mark the moment shown, or the newest one when the app is live", () => {
    expect(acrossLanes(session, 3)).toBe("calc(180px + (100% - 192px) * 0.4000)")
    expect(acrossLanes(session, null)).toBe("calc(180px + (100% - 192px) * 1.0000)")
  })

  it("turn a pointer position into the nearest event, held to the ends", () => {
    expect(seqAt(session, surface(100, 1192, 100 + 180 + 400))).toBe(3)
    expect(seqAt(session, surface(100, 1192, 0))).toBe(1)
    expect(seqAt(session, surface(100, 1192, 5000))).toBe(6)
    expect(seqAt([], surface(100, 1192, 500))).toBe(null)
  })

  it("measure a pointer against the strip between the slot names and the right margin", () => {
    expect(seqAt(session, surface(100, 1192, 100 + 180 + 700))).toBe(5)
  })

  it("give every kind of event its own colour", () => {
    expect(
      ["command", "ui", "route", "data", "call", "noticed", "refused", "waited"].map(colourOf),
    ).toEqual([
      "#6ea8fe",
      "#c39bff",
      "#f0b45a",
      "#4fd1c5",
      "#8bd17c",
      "#ff8a94",
      "#ff8a94",
      "#f0b45a",
    ])
  })

  it("draw each tick as a small block in its kind's colour", () => {
    expect(
      ticksDrawn([
        { seq: 1, kind: "ui", at: "25.00%" },
        { seq: 2, kind: "unknown", at: "75.00%" },
      ]),
    ).toBe(
      "linear-gradient(#c39bff, #c39bff) calc(25.00% - 3px) 4px / 6px 10px no-repeat, linear-gradient(#6ea8fe, #6ea8fe) calc(75.00% - 3px) 4px / 6px 10px no-repeat",
    )
  })
})
