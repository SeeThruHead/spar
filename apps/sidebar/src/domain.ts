import { Array, Option, Schema } from "effect"

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

export const Section = Schema.Struct({
  key: Schema.String,
  movable: Schema.Boolean,
  title: Schema.String,
  collapsed: Schema.Boolean,
  count: Schema.Int,
  needsYou: Schema.Int,
  rows: Schema.Array(Agent),
})

export type Section = typeof Section.Type

export const pinnedKey = "pinned"

export const looseKey = "chats"

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
    movable: board.spaces.some((space) => space.id === key),
    title,
    collapsed,
    count: agents.length,
    needsYou: agents.filter((agent) => agent.status === "blocked").length,
    rows: collapsed ? [] : agents,
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

export const countsOf = (found: Section): string =>
  `${found.count} ${found.count === 1 ? "agent" : "agents"}, ${found.needsYou} waiting on you`

export const sectionKeyOf = (agent: Agent): string => {
  if (agent.pinned) return pinnedKey

  return agent.spaceId ?? looseKey
}

const putIn = (board: Board, agent: Agent, key: string): Option.Option<Agent> => {
  if (key === pinnedKey) return Option.some({ ...agent, pinned: true })
  if (key === looseKey) return Option.some({ ...agent, pinned: false, spaceId: null })

  return Option.map(
    Array.findFirst(board.spaces, (space) => space.id === key),
    (space) => ({ ...agent, pinned: false, spaceId: space.id }),
  )
}

const insertedAt = <A>(items: ReadonlyArray<A>, index: number, item: A): ReadonlyArray<A> => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
]

const placeBefore = <A>(
  items: ReadonlyArray<A>,
  item: A,
  next: Option.Option<A>,
): ReadonlyArray<A> =>
  insertedAt(
    items,
    Option.match(next, { onNone: () => items.length, onSome: (found) => items.indexOf(found) }),
    item,
  )

export const agentPlaced = (board: Board, id: AgentId, key: string, index: number): Board => {
  const others = board.agents.filter((agent) => agent.id !== id)
  const following = Array.get(
    others.filter((agent) => sectionKeyOf(agent) === key),
    index,
  )

  return Array.findFirst(board.agents, (agent) => agent.id === id).pipe(
    Option.flatMap((mover) => putIn(board, mover, key)),
    Option.match({
      onNone: () => board,
      onSome: (placed) => ({ ...board, agents: placeBefore(others, placed, following) }),
    }),
  )
}

export const agentPlacedBefore = (board: Board, id: AgentId, before: AgentId): Board => {
  const others = board.agents.filter((agent) => agent.id !== id)

  return Option.match(
    Array.findFirst(others, (agent) => agent.id === before),
    {
      onNone: () => board,
      onSome: (next) => {
        const key = sectionKeyOf(next)
        const index = others.filter((agent) => sectionKeyOf(agent) === key).indexOf(next)

        return agentPlaced(board, id, key, index)
      },
    },
  )
}

const clamped = (index: number, count: number): number => Math.min(Math.max(index, 0), count - 1)

export const agentNudged = (board: Board, id: AgentId, by: number): Board =>
  Option.match(
    Array.findFirst(board.agents, (agent) => agent.id === id),
    {
      onNone: () => board,
      onSome: (mover) => {
        const key = sectionKeyOf(mover)
        const together = board.agents.filter((agent) => sectionKeyOf(agent) === key)

        return agentPlaced(board, id, key, clamped(together.indexOf(mover) + by, together.length))
      },
    },
  )

export const spacePlaced = (board: Board, id: SpaceId, index: number): Board => {
  const others = board.spaces.filter((space) => space.id !== id)

  return Option.match(
    Array.findFirst(board.spaces, (space) => space.id === id),
    {
      onNone: () => board,
      onSome: (mover) => ({
        ...board,
        spaces: placeBefore(others, mover, Array.get(others, index)),
      }),
    },
  )
}

export const spacePlacedBefore = (board: Board, id: SpaceId, before: string): Board => {
  const others = board.spaces.filter((space) => space.id !== id)
  const index = others.findIndex((space) => space.id === before)

  return index === -1 ? board : spacePlaced(board, id, index)
}

export const spaceNudged = (board: Board, id: SpaceId, by: number): Board => {
  const from = board.spaces.findIndex((space) => space.id === id)

  return from === -1 ? board : spacePlaced(board, id, clamped(from + by, board.spaces.length))
}
