import { Effect, Schema } from "effect"
import { Store } from "spar"
import {
  Agent,
  AgentId,
  Board,
  Space,
  SpaceId,
  agentNudged,
  agentPlaced,
  agentPlacedBefore,
  spaceNudged,
  spacePlacedBefore,
  toggled,
} from "./domain.ts"
import { Server } from "./Server.ts"

const agent = (id: string, name: string, given: Partial<Agent>): Agent => ({
  id: AgentId.make(id),
  name,
  status: "idle",
  pinned: false,
  spaceId: null,
  tags: [],
  ...given,
})

const hangar = SpaceId.make("space-1")

const homelab = SpaceId.make("space-2")

const initialState: Board = {
  agents: [
    agent("agent-1", "Release notes", { status: "blocked", spaceId: hangar, tags: ["docs"] }),
    agent("agent-2", "Flaky test hunt", { status: "working", spaceId: hangar }),
    agent("agent-3", "Backup check", { status: "done", spaceId: homelab, tags: ["ops"] }),
    agent("agent-5", "Inbox triage", { status: "working", pinned: true }),
    agent("agent-4", "Trip planning", { status: "idle" }),
  ],
  spaces: [
    { id: hangar, name: "Hangar" },
    { id: homelab, name: "Homelab" },
  ],
  collapsed: [],
  nextNumber: 6,
}

const withAgent = (board: Board, id: AgentId, change: (agent: Agent) => Agent): Board => ({
  ...board,
  agents: board.agents.map((found) => (found.id === id ? change(found) : found)),
})

export class BoardStore extends Store.Tag<BoardStore>()("sidebar/BoardStore", {
  state: Board,
  initialState,
  actions: {
    started: Store.action(Schema.Struct({ name: Schema.String }), (board: Board, { name }) => ({
      ...board,
      agents: [agent(`agent-${board.nextNumber}`, name, { status: "working" }), ...board.agents],
      nextNumber: board.nextNumber + 1,
    })),
    pinToggled: Store.action(Schema.Struct({ id: AgentId }), (board: Board, { id }) =>
      withAgent(board, id, (found) => ({ ...found, pinned: !found.pinned })),
    ),
    moved: Store.action(
      Schema.Struct({ id: AgentId, spaceId: Schema.NullOr(SpaceId) }),
      (board: Board, { id, spaceId }) => withAgent(board, id, (found) => ({ ...found, spaceId })),
    ),
    tagged: Store.action(
      Schema.Struct({ id: AgentId, tags: Schema.Array(Schema.String) }),
      (board: Board, { id, tags }) => withAgent(board, id, (found) => ({ ...found, tags })),
    ),
    spaceAdded: Store.action(Schema.Struct({ name: Schema.String }), (board: Board, { name }) => ({
      ...board,
      spaces: [...board.spaces, { id: SpaceId.make(`space-${board.nextNumber}`), name }],
      nextNumber: board.nextNumber + 1,
    })),
    agentDropped: Store.action(
      Schema.Struct({ id: AgentId, section: Schema.String, before: Schema.NullOr(AgentId) }),
      (board: Board, { id, section, before }) =>
        before === null
          ? agentPlaced(board, id, section, board.agents.length)
          : agentPlacedBefore(board, id, before),
    ),
    agentNudged: Store.action(
      Schema.Struct({ id: AgentId, by: Schema.Int }),
      (board: Board, { id, by }) => agentNudged(board, id, by),
    ),
    spaceDropped: Store.action(
      Schema.Struct({ id: SpaceId, before: Schema.String }),
      (board: Board, { id, before }) => spacePlacedBefore(board, id, before),
    ),
    spaceNudged: Store.action(
      Schema.Struct({ id: SpaceId, by: Schema.Int }),
      (board: Board, { id, by }) => spaceNudged(board, id, by),
    ),
    sectionToggled: Store.action(
      Schema.Struct({ key: Schema.String }),
      (board: Board, { key }) => ({
        ...board,
        collapsed: toggled(board.collapsed, key),
      }),
    ),
  },
  selectors: {
    board: Store.selector(Board, (board: Board) => board),
    spaces: Store.selector(Schema.Array(Space), (board: Board) => board.spaces),
    agents: Store.selector(Schema.Array(Agent), (board: Board) => board.agents),
  },
}) {}

export const BoardStoreLive = BoardStore.layerDurable({}, [
  Store.outbox(
    BoardStore.actions.started,
    Effect.fnUntraced(function* ({ name }, idempotencyKey) {
      const server = yield* Server

      yield* server.start(name, idempotencyKey)
    }),
  ),
])
