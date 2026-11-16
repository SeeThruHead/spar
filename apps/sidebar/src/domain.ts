import { Schema } from "effect"

export const AgentId = Schema.String.pipe(Schema.brand("AgentId"))

export type AgentId = typeof AgentId.Type

export const SpaceId = Schema.String.pipe(Schema.brand("SpaceId"))

export type SpaceId = typeof SpaceId.Type

export const Status = Schema.Literals(["working", "blocked", "idle", "done"])

export type Status = typeof Status.Type

export const Agent = Schema.Struct({
  id: AgentId,
  name: Schema.String,
  status: Status,
  pinned: Schema.Boolean,
  spaceId: Schema.NullOr(SpaceId),
  tags: Schema.Array(Schema.String),
})

export type Agent = typeof Agent.Type

export const Space = Schema.Struct({ id: SpaceId, name: Schema.String })

export type Space = typeof Space.Type

export const Board = Schema.Struct({
  agents: Schema.Array(Agent),
  spaces: Schema.Array(Space),
  collapsed: Schema.Array(Schema.String),
  nextNumber: Schema.Int,
})

export type Board = typeof Board.Type

export type Section = {
  readonly key: string
  readonly title: string
  readonly collapsed: boolean
  readonly count: number
  readonly needsYou: number
  readonly rows: ReadonlyArray<Agent>
}

export const pinnedKey = "pinned"

export const looseKey = "chats"

const attention: Readonly<Record<Status, number>> = { blocked: 0, working: 1, idle: 2, done: 3 }

const byAttention = (agents: ReadonlyArray<Agent>): ReadonlyArray<Agent> =>
  agents.toSorted(
    (left, right) =>
      attention[left.status] - attention[right.status] || left.name.localeCompare(right.name),
  )

const matches = (agent: Agent, text: string): boolean => {
  const wanted = text.trim().toLowerCase()
  if (wanted === "") return true
  if (agent.name.toLowerCase().includes(wanted)) return true

  return agent.tags.some((tag) => tag.toLowerCase().includes(wanted))
}

const section = (
  board: Board,
  key: string,
  title: string,
  agents: ReadonlyArray<Agent>,
  filtering: boolean,
): Section => {
  const collapsed = !filtering && board.collapsed.includes(key)

  return {
    key,
    title,
    collapsed,
    count: agents.length,
    needsYou: agents.filter((agent) => agent.status === "blocked").length,
    rows: collapsed ? [] : byAttention(agents),
  }
}

export const sectionsOf = (board: Board, text: string): ReadonlyArray<Section> => {
  const filtering = text.trim() !== ""
  const shown = board.agents.filter((agent) => matches(agent, text))
  const unpinned = shown.filter((agent) => !agent.pinned)

  return [
    section(
      board,
      pinnedKey,
      "Pinned",
      shown.filter((agent) => agent.pinned),
      filtering,
    ),
    section(
      board,
      looseKey,
      "Chats",
      unpinned.filter((agent) => agent.spaceId === null),
      filtering,
    ),
    ...board.spaces.map((space) =>
      section(
        board,
        space.id,
        space.name,
        unpinned.filter((agent) => agent.spaceId === space.id),
        filtering,
      ),
    ),
  ].filter((found) => !filtering || found.count > 0)
}

export const needsYou = (board: Board): number =>
  board.agents.filter((agent) => agent.status === "blocked").length

export const tagsOf = (text: string): ReadonlyArray<string> => [
  ...new Set(
    text
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag !== ""),
  ),
]

export const toggled = <A>(values: ReadonlyArray<A>, value: A): ReadonlyArray<A> =>
  values.includes(value) ? values.filter((found) => found !== value) : [...values, value]
