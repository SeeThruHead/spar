import { describe, expect, it } from "@effect/vitest"
import {
  aboutSpan,
  acrossLanes,
  eventShown,
  lanesOf,
  seqAt,
  summaryOfMoment,
  ticksDrawn,
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
