import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import {
  AgentId,
  SpaceId,
  agentNudged,
  agentPlaced,
  agentPlacedBefore,
  countsOf,
  needsYou,
  sectionsOf,
  spaceNudged,
  spacePlaced,
  spacePlacedBefore,
  tagsOf,
  toggled,
} from "../src/domain.ts"
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

const docs = SpaceId.make("docs")

const web = SpaceId.make("web")

const id = (name: string): AgentId => AgentId.make(name.toLowerCase())

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

const order = (given: Board) => given.spaces.map((space) => space.name)

const names = (text: string, given: Board = board) =>
  sectionsOf(given, text).map((found) => [found.title, ...found.rows.map((row) => row.name)])

describe("the sidebar's sections", () => {
  it("pinned agents come first, then loose chats, then each project, each in the order kept", () => {
    expect(names("")).toEqual([
      ["Pinned", "Cy"],
      ["Chats", "Zed", "Abe"],
      ["Operations", "Ada", "Bob"],
    ])
    expect(sectionsOf(board, "").map((found) => found.movable)).toEqual([false, false, true])
  })

  it("each section counts its agents and those waiting on you", () => {
    expect(sectionsOf(board, "").map((found) => [found.count, found.needsYou])).toEqual([
      [1, 1],
      [2, 0],
      [2, 1],
    ])
    expect(needsYou(board)).toBe(2)
    expect(sectionsOf(board, "").map(countsOf)).toEqual([
      "1 agent, 1 waiting on you",
      "2 agents, 0 waiting on you",
      "2 agents, 1 waiting on you",
    ])
  })

  it("a collapsed section keeps its counts and hides its rows", () => {
    const [, , operations] = sectionsOf({ ...board, collapsed: ["ops"] }, "")

    expect([operations?.collapsed, operations?.count, operations?.rows]).toEqual([true, 2, []])
  })

  it("an agent dropped at a place in a section goes there and takes on that section", () => {
    expect(names("", agentPlaced(board, id("Zed"), "ops", 1))).toEqual([
      ["Pinned", "Cy"],
      ["Chats", "Abe"],
      ["Operations", "Ada", "Zed", "Bob"],
    ])
    expect(names("", agentPlaced(board, id("Bob"), "chats", 0))[1]).toEqual([
      "Chats",
      "Bob",
      "Zed",
      "Abe",
    ])
    expect(names("", agentPlaced(board, id("Bob"), "chats", 9))[1]).toEqual([
      "Chats",
      "Zed",
      "Abe",
      "Bob",
    ])
    expect(names("", agentPlaced(board, id("Ada"), "pinned", 0))[0]).toEqual([
      "Pinned",
      "Ada",
      "Cy",
    ])
    expect(names("", agentPlaced(board, id("Abe"), "chats", 0))[1]).toEqual(["Chats", "Abe", "Zed"])
  })

  it("a pinned agent dropped back on its project is unpinned there, and keeps its project while pinned", () => {
    const pinned = agentPlaced(board, id("Ada"), "pinned", 1)

    expect(pinned.agents.find((found) => found.name === "Ada")?.spaceId).toBe(ops)
    expect(names("", agentPlaced(pinned, id("Ada"), "ops", 0))[2]).toEqual([
      "Operations",
      "Ada",
      "Bob",
    ])
  })

  it("a drop onto a section or an agent that is not there changes nothing", () => {
    expect(agentPlaced(board, id("Zed"), "no such project", 0)).toBe(board)
    expect(agentPlaced(board, id("Nobody"), "ops", 0)).toBe(board)
    expect(agentPlacedBefore(board, id("Zed"), id("Nobody"))).toBe(board)
    expect(agentPlacedBefore(board, id("Zed"), id("Zed"))).toBe(board)
  })

  it("an agent dropped on another lands just before it, in that one's section", () => {
    expect(names("", agentPlacedBefore(board, id("Zed"), id("Bob")))[2]).toEqual([
      "Operations",
      "Ada",
      "Zed",
      "Bob",
    ])
    expect(names("", agentPlacedBefore(board, id("Bob"), id("Cy")))[0]).toEqual([
      "Pinned",
      "Bob",
      "Cy",
    ])
  })

  it("moving an agent up or down by keyboard steps within its section and stops at the ends", () => {
    expect(names("", agentNudged(board, id("Zed"), 1))[1]).toEqual(["Chats", "Abe", "Zed"])
    expect(names("", agentNudged(board, id("Abe"), -1))[1]).toEqual(["Chats", "Abe", "Zed"])
    expect(names("", agentNudged(board, id("Zed"), -1))[1]).toEqual(["Chats", "Zed", "Abe"])
    expect(names("", agentNudged(board, id("Abe"), 1))[1]).toEqual(["Chats", "Zed", "Abe"])
    expect(agentNudged(board, id("Nobody"), 1)).toBe(board)
  })

  it("projects can be put in another order by drop or by keyboard", () => {
    const more: Board = {
      ...board,
      spaces: [
        { id: ops, name: "Operations" },
        { id: docs, name: "Docs" },
        { id: web, name: "Web" },
      ],
    }

    expect(order(spacePlaced(more, web, 0))).toEqual(["Web", "Operations", "Docs"])
    expect(order(spacePlaced(more, ops, 9))).toEqual(["Docs", "Web", "Operations"])
    expect(order(spacePlacedBefore(more, web, ops))).toEqual(["Web", "Operations", "Docs"])
    expect(order(spacePlacedBefore(more, ops, web))).toEqual(["Docs", "Operations", "Web"])
    expect(order(spaceNudged(more, ops, 1))).toEqual(["Docs", "Operations", "Web"])
    expect(order(spaceNudged(more, web, 1))).toEqual(["Operations", "Docs", "Web"])
    expect(order(spaceNudged(more, docs, -1))).toEqual(["Docs", "Operations", "Web"])
    expect(order(spaceNudged(more, ops, -1))).toEqual(["Operations", "Docs", "Web"])
    expect(spacePlaced(more, SpaceId.make("gone"), 0)).toBe(more)
    expect(spacePlacedBefore(more, web, "pinned")).toBe(more)
    expect(spaceNudged(more, SpaceId.make("gone"), 1)).toBe(more)
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
