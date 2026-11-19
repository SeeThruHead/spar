import { Effect, Option, Schedule, Schema, pipe } from "effect"
import { Query, Reactive, Router, View } from "spar"
import { BoardStore } from "./BoardStore.ts"
import type { Agent, Board } from "./domain.ts"
import { Notes } from "./Notes.ts"
import { home } from "./routes.ts"
import { Started } from "./api.ts"
import { NoRecord, Server, ServerUnreachable } from "./server/Server.ts"
import {
  AgentLoadingView,
  AgentMissingView,
  AgentPageView,
  ServerRecordView,
} from "./SidebarView.tsx"

class AgentNotFound extends Schema.TaggedError<AgentNotFound, { readonly brand: unique symbol }>()(
  "AgentNotFound",
  { id: Schema.String },
) {
  override get message() {
    return `There is no agent called ${this.id}. It may have been removed.`
  }
}

export class RecordQuery extends Query.Tag<RecordQuery>()("sidebar/Record", {
  input: Schema.String,
  success: Started,
  failure: Schema.Union([NoRecord, ServerUnreachable]),
  load: (name: string) => Effect.flatMap(Effect.service(Server), (server) => server.describe(name)),
  retry: Schedule.upTo(Schedule.spaced("150 millis"), { times: 4 }),
}) {}

const recordText = (
  name: string,
  record: Started | null,
  problem: NoRecord | ServerUnreachable | null,
): string => {
  if (record !== null) return `The server started this agent as ${record.key}.`
  if (problem !== null) return problem.message

  return `Asking the server about ${name}.`
}

const ServerRecord = View.taking(
  { name: Schema.String },
  Effect.fnUntraced(function* ({ name }) {
    const record = yield* RecordQuery.ask(name)
    const answer = yield* Reactive.zip(record.value, record.error)

    return { text: Reactive.map(answer, ([found, problem]) => recordText(name, found, problem)) }
  }),
)(ServerRecordView)

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
      if (found === undefined) return yield* new AgentNotFound({ id })

      const agent = Reactive.map(store.select.board, (now) =>
        Option.getOrElse(
          Option.fromNullishOr(now.agents.find((other) => other.id === found.id)),
          () => found,
        ),
      )

      return {
        record: yield* View.child(ServerRecord, { name: found.name }),
        notes: yield* View.child(Notes, { id: "agent-note", title: "Notes on this agent" }),
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
  View.recover(AgentNotFound, AgentMissingView),
  View.pending(AgentLoadingView),
)
