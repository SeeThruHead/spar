import { Effect, Schema } from "effect"
import { Store } from "spar"
import { AgentId, Board, SpaceId, toggled } from "./domain.ts"
import type { Agent } from "./domain.ts"
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
    agent("agent-4", "Trip planning", { status: "idle" }),
    agent("agent-5", "Inbox triage", { status: "working", pinned: true }),
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
  initialState,
  actions: {
    started: Store.action(Schema.Struct({ name: Schema.String }), (board: Board, { name }) => ({
      ...board,
      agents: [...board.agents, agent(`agent-${board.nextNumber}`, name, { status: "working" })],
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
    sectionToggled: Store.action(
      Schema.Struct({ key: Schema.String }),
      (board: Board, { key }) => ({
        ...board,
        collapsed: toggled(board.collapsed, key),
      }),
    ),
  },
  selectors: {
    board: (board) => board,
    spaces: (board) => board.spaces,
    agents: (board) => board.agents,
  },
}) {}

export const BoardStoreLive = BoardStore.layerDurable({ state: Board }, [
  Store.outbox(
    BoardStore.actions.started,
    Effect.fnUntraced(function* ({ name }, idempotencyKey) {
      const server = yield* Server

      yield* server.start(name, idempotencyKey)
    }),
  ),
])
