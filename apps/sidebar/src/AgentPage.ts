import { Effect, Option, Schema, pipe } from "effect"
import { Reactive, Router, View } from "spar"
import { BoardStore } from "./BoardStore.ts"
import type { Agent, Board } from "./domain.ts"
import { home } from "./routes.ts"
import { AgentLoadingView, AgentMissingView, AgentPageView } from "./SidebarView.tsx"

class AgentNotFound extends Schema.TaggedError<AgentNotFound, { readonly brand: unique symbol }>()(
  "AgentNotFound",
  { id: Schema.String },
) {
  override get message() {
    return `There is no agent called ${this.id}. It may have been removed.`
  }
}

const projectOf = (board: Board, agent: Agent): string =>
  Option.match(Option.fromNullishOr(board.spaces.find((space) => space.id === agent.spaceId)), {
    onNone: () => "No project",
    onSome: (space) => space.name,
  })

export const AgentPage = pipe(
  View.taking(
    { id: Schema.String },
    Effect.fnUntraced(function* ({ id }) {
      const store = yield* BoardStore
      const router = yield* Router.Router
      const board = yield* store.select.board.get
      const found = board.agents.find((agent) => agent.id === id)

      yield* Effect.annotateCurrentSpan("agent.id", id)
      yield* Effect.sleep("120 millis")

      if (found === undefined) return yield* new AgentNotFound({ id })

      const agent = Reactive.map(store.select.board, (now) =>
        Option.getOrElse(
          Option.fromNullishOr(now.agents.find((other) => other.id === found.id)),
          () => found,
        ),
      )

      return {
        name: Reactive.map(agent, (now) => now.name),
        status: Reactive.map(agent, (now) => now.status),
        tags: Reactive.map(agent, (now) => (now.tags.length === 0 ? "None" : now.tags.join(", "))),
        project: Reactive.map(store.select.board, (now) =>
          projectOf(
            now,
            Option.getOrElse(
              Option.fromNullishOr(now.agents.find((other) => other.id === found.id)),
              () => found,
            ),
          ),
        ),
        pinLabel: Reactive.map(agent, (now) => (now.pinned ? "Unpin" : "Pin to the top")),
        idle: Reactive.succeed(false),
        onPin: store.commands.pinToggled({ id: found.id }),
        home: router.link(home, {}),
      }
    }),
  )(AgentPageView),
  View.recover("AgentNotFound", AgentMissingView),
  View.pending(AgentLoadingView),
)
