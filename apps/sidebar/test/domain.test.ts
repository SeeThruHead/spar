import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { AgentId, SpaceId, needsYou, sectionsOf, tagsOf, toggled } from "../src/domain.ts"
import type { Agent, Board } from "../src/domain.ts"

const agent = (name: string, given: Partial<Agent> = {}): Agent => ({
  id: AgentId.make(name.toLowerCase()),
  name,
  status: "idle",
  pinned: false,
  spaceId: null,
  tags: [],
  ...given,
})

const ops = SpaceId.make("ops")

const board: Board = {
  agents: [
    agent("Zed", { status: "done" }),
    agent("Ada", { status: "working", spaceId: ops, tags: ["deploy"] }),
    agent("Bob", { status: "blocked", spaceId: ops }),
    agent("Cy", { pinned: true, status: "blocked" }),
    agent("Abe"),
  ],
  spaces: [{ id: ops, name: "Operations" }],
  collapsed: [],
  nextNumber: 6,
}

const names = (text: string, given: Board = board) =>
  sectionsOf(given, text).map((found) => [found.title, ...found.rows.map((row) => row.name)])

describe("the sidebar's sections", () => {
  it("pinned agents come first, then loose chats, then each project, most urgent first", () => {
    expect(names("")).toEqual([
      ["Pinned", "Cy"],
      ["Chats", "Abe", "Zed"],
      ["Operations", "Bob", "Ada"],
    ])
  })

  it("each section counts its agents and those waiting on you", () => {
    expect(sectionsOf(board, "").map((found) => [found.count, found.needsYou])).toEqual([
      [1, 1],
      [2, 0],
      [2, 1],
    ])
    expect(needsYou(board)).toBe(2)
  })

  it("a collapsed section keeps its counts and hides its rows", () => {
    const [, , operations] = sectionsOf({ ...board, collapsed: ["ops"] }, "")

    expect([operations?.collapsed, operations?.count, operations?.rows]).toEqual([true, 2, []])
  })

  it("agents in the same state are listed by name", () => {
    const loose = { ...board, agents: [agent("Mo"), agent("Al"), agent("Di")] }

    expect(names("", loose)[1]).toEqual(["Chats", "Al", "Di", "Mo"])
  })

  it("a filter matches names and tags, drops empty sections and opens collapsed ones", () => {
    expect(names("DEPLOY", { ...board, collapsed: ["ops"] })).toEqual([["Operations", "Ada"]])
    expect(names(" b ")).toEqual([
      ["Chats", "Abe"],
      ["Operations", "Bob"],
    ])
  })

  it("tags are split on commas, trimmed, lower-cased and de-duplicated", () => {
    expect(tagsOf(" Deploy, urgent ,, deploy")).toEqual(["deploy", "urgent"])
  })

  it.prop(
    "toggling a value twice leaves the list as it was",
    [Schema.Array(Schema.String), Schema.String],
    ([values, value]) => {
      const unique = [...new Set(values)].filter((found) => found !== value)

      expect(toggled(toggled(unique, value), value)).toEqual(unique)
      expect(toggled(unique, value)).toEqual([...unique, value])
    },
  )

  it.prop(
    "every agent the filter keeps appears in exactly one section",
    [Schema.Array(Schema.Literals(["Ada", "Bob", "Cy", "Abe", "Zed", "x"]))],
    ([texts]) => {
      const text = texts.join("").slice(0, 2)
      const listed = sectionsOf(board, text).flatMap((found) => found.rows.map((row) => row.id))

      expect(new Set(listed).size).toBe(listed.length)
    },
  )
})
