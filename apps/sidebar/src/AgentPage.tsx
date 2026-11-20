import { Effect, Option, Schedule, Schema, pipe } from "effect"
import { Query, Reactive, Router, View, compose, withProps, withQuery, withStore } from "spar"
import { BoardStore } from "./BoardStore.ts"
import type { Agent, Board } from "./domain.ts"
import { Notes } from "./Notes.tsx"
import { home } from "./routes.ts"
import { Started } from "./api.ts"
import { NoRecord, Server, ServerUnreachable } from "./server/Server.ts"
import { AgentLoadingView, AgentMissingView } from "./SidebarView.tsx"

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

const withText = (props: {
  readonly name: string
  readonly record: Query.Handle<Started, NoRecord | ServerUnreachable>
}) =>
  Effect.map(Reactive.zip(props.record.value, props.record.error), (answer) => ({
    text: Reactive.map(answer, ([found, problem]) => recordText(props.name, found, problem)),
  }))

const ServerRecordView = compose(
  withProps({ name: Schema.String }),
  withQuery("record", RecordQuery, (props) => props.name),
  withText,
)((props) => <p aria-label="Server record">{props.text}</p>)

const projectOf = (board: Board, agent: Agent): string =>
  Option.match(Option.fromNullishOr(board.spaces.find((space) => space.id === agent.spaceId)), {
    onNone: () => "No project",
    onSome: (space) => space.name,
  })

const withAgent = Effect.fnUntraced(function* (props: { readonly id: string }) {
  const store = yield* BoardStore
  const board = yield* store.select.board.get
  const found = board.agents.find((agent) => agent.id === props.id)

  yield* Effect.annotateCurrentSpan("agent.id", props.id)
  if (found === undefined) return yield* new AgentNotFound({ id: props.id })

  const current = (now: Board): Agent =>
    Option.getOrElse(
      Option.fromNullishOr(now.agents.find((other) => other.id === found.id)),
      () => found,
    )
  const agent = Reactive.map(store.select.board, current)

  return {
    agentName: found.name,
    name: Reactive.map(agent, (now) => now.name),
    status: Reactive.map(agent, (now) => now.status),
    tags: Reactive.map(agent, (now) => (now.tags.length === 0 ? "None" : now.tags.join(", "))),
    project: Reactive.map(store.select.board, (now) => projectOf(now, current(now))),
    pinLabel: Reactive.map(agent, (now) => (now.pinned ? "Unpin" : "Pin to the top")),
    onPin: store.commands.pinToggled({ id: found.id }),
  }
})

export const AgentPage = pipe(
  compose(
    withProps({ id: Schema.String }),
    withAgent,
    withStore(Router.Router, (router) => ({ home: router.link(home, {}) })),
  )((props) => (
    <section>
      <p>
        <a
          href={props.home.href}
          onClick={props.home.onClick}
          onPointerenter={props.home.onIntent}
          onFocus={props.home.onIntent}
        >
          All agents
        </a>
      </p>
      <h1>{props.name}</h1>
      <dl>
        <dt>Status</dt>
        <dd>{props.status}</dd>
        <dt>Project</dt>
        <dd>{props.project}</dd>
        <dt>Tags</dt>
        <dd>{props.tags}</dd>
      </dl>
      <ServerRecordView name={props.agentName} />
      <Notes id="agent-note" title="Notes on this agent" />
      <button type="button" class="spar-button spar-quiet" onClick={props.onPin}>
        {props.pinLabel}
      </button>
    </section>
  )),
  View.recover(AgentNotFound, AgentMissingView),
  View.pending(AgentLoadingView),
)
