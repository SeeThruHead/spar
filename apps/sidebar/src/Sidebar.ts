import { Data, Effect, Option, Schema, pipe } from "effect"
import { Events, Form, Outbox, Reactive, Router, UiState, View } from "spar"
import type { Action } from "spar"
import { Dialog, Menu, Select, Toast } from "@spar/ui"
import { BoardStore } from "./BoardStore.ts"
import { AgentId, SpaceId, needsYou, sectionsOf, tagsOf } from "./domain.ts"
import type { Agent, Section } from "./domain.ts"
import { agentRoute } from "./routes.ts"
import {
  AgentRowView,
  MoveFormView,
  NameFormView,
  SectionView,
  SidebarView,
} from "./SidebarView.tsx"

type Editing = Data.TaggedEnum<{
  Nothing: {}
  Starting: {}
  AddingProject: {}
  Tagging: { readonly id: AgentId }
  Moving: { readonly id: AgentId }
}>

const Editing = Data.taggedEnum<Editing>()

type Shared = {
  readonly editing: UiState.UiState<Editing>
  readonly onClose: Action
}

const Named = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter((text) => text.trim().length > 0 || "Enter a name")),
})

const noProject = "none"

const AgentRow = View.connect(
  Effect.fnUntraced(function* (props: {
    readonly agent: Reactive.Reactive<Agent>
    readonly id: string
    readonly editing: UiState.UiState<Editing>
  }) {
    const store = yield* BoardStore
    const router = yield* Router.Router
    const id = AgentId.make(props.id)
    const first = yield* props.agent.get

    return {
      agent: props.agent,
      link: router.link(agentRoute, { id: props.id }),
      menu: yield* View.child(Menu, {
        label: `Actions for ${first.name}`,
        text: "Actions",
        items: [
          { label: "Pin or unpin", onChoose: store.commands.pinToggled({ id }) },
          { label: "Edit tags", onChoose: UiState.set(props.editing, Editing.Tagging({ id })) },
          {
            label: "Move to a project",
            onChoose: UiState.set(props.editing, Editing.Moving({ id })),
          },
        ],
      }),
    }
  }),
)(AgentRowView)

const SectionPanel = View.connect(
  Effect.fnUntraced(function* (props: {
    readonly section: Reactive.Reactive<Section>
    readonly sectionKey: string
    readonly editing: UiState.UiState<Editing>
  }) {
    const store = yield* BoardStore
    const rows = yield* pipe(
      Reactive.map(props.section, (section) => section.rows),
      Reactive.mapBy(
        (agent: Agent) => agent.id,
        AgentRow,
        (agent, id) => ({ agent, id, editing: props.editing }),
      ),
    )

    return {
      section: props.section,
      rows,
      onToggle: store.commands.sectionToggled({ key: props.sectionKey }),
    }
  }),
)(SectionView)

const StartForm = View.connect(
  Effect.fnUntraced(function* ({ onClose }: Shared) {
    const store = yield* BoardStore
    const toasts = yield* Toast.Toasts
    const form = yield* Form.make(Named, { name: "" })

    return {
      id: "agent-name",
      label: "What should it work on?",
      hint: "A short name for the task",
      action: "Start agent",
      field: form.field("name"),
      busy: form.submitting,
      onSubmit: form.submitThen(
        ({ name }) =>
          Effect.andThen(
            store.commands.started({ name: name.trim() }),
            toasts.show(`Started ${name.trim()}`, "success"),
          ),
        onClose,
      ),
    }
  }),
)(NameFormView)

const ProjectForm = View.connect(
  Effect.fnUntraced(function* ({ onClose }: Shared) {
    const store = yield* BoardStore
    const form = yield* Form.make(Named, { name: "" })

    return {
      id: "project-name",
      label: "Project name",
      hint: "Agents can be moved into it afterwards",
      action: "Add project",
      field: form.field("name"),
      busy: form.submitting,
      onSubmit: form.submitThen(
        ({ name }) => store.commands.spaceAdded({ name: name.trim() }),
        onClose,
      ),
    }
  }),
)(NameFormView)

const editedAgent = Effect.fnUntraced(function* (editing: UiState.UiState<Editing>) {
  const store = yield* BoardStore
  const now = yield* editing.get
  const agents = yield* store.select.agents.get

  return Option.fromNullishOr(
    agents.find(
      (agent) => (now._tag === "Tagging" || now._tag === "Moving") && agent.id === now.id,
    ),
  )
})

const TagsForm = View.connect(
  Effect.fnUntraced(function* ({ editing, onClose }: Shared) {
    const store = yield* BoardStore
    const agent = yield* editedAgent(editing)
    const tags = Option.match(agent, { onNone: () => "", onSome: (found) => found.tags.join(", ") })
    const form = yield* Form.make(Schema.Struct({ name: Schema.String }), { name: tags })

    return {
      id: "agent-tags",
      label: "Tags",
      hint: "Separate tags with commas",
      action: "Save tags",
      field: form.field("name"),
      busy: form.submitting,
      onSubmit: form.submitThen(
        ({ name }) =>
          Effect.forEach(
            Option.toArray(agent),
            (found) => store.commands.tagged({ id: found.id, tags: tagsOf(name) }),
            { discard: true },
          ),
        onClose,
      ),
    }
  }),
)(NameFormView)

const MoveForm = View.connect(
  Effect.fnUntraced(function* ({ editing, onClose }: Shared) {
    const store = yield* BoardStore
    const agent = yield* editedAgent(editing)
    const spaces = yield* store.select.spaces.get
    const current = Option.match(agent, {
      onNone: () => noProject,
      onSome: (found) => found.spaceId ?? noProject,
    })
    const form = yield* Form.make(Schema.Struct({ project: Schema.String }), { project: current })
    const field = form.field("project")

    return {
      busy: form.submitting,
      choice: Select({
        id: "agent-project",
        label: "Project",
        field,
        options: [
          { value: noProject, label: "No project" },
          ...spaces.map((space) => ({ value: space.id, label: space.name })),
        ],
      }),
      onSubmit: form.submitThen(
        ({ project }) =>
          Effect.forEach(
            Option.toArray(agent),
            (found) =>
              store.commands.moved({
                id: found.id,
                spaceId: project === noProject ? null : SpaceId.make(project),
              }),
            { discard: true },
          ),
        onClose,
      ),
    }
  }),
)(MoveFormView)

const dialogs = Effect.fnUntraced(function* (editing: UiState.UiState<Editing>) {
  const onClose = UiState.set(editing, Editing.Nothing())
  const shared = { editing, onClose }
  const when = (tag: Editing["_tag"]) => Reactive.map(editing, (now) => now._tag === tag)

  return [
    yield* pipe(
      when("Starting"),
      Reactive.when(Dialog({ id: "start", title: "Start an agent" }, StartForm), shared),
    ),
    yield* pipe(
      when("AddingProject"),
      Reactive.when(Dialog({ id: "project", title: "New project" }, ProjectForm), shared),
    ),
    yield* pipe(
      when("Tagging"),
      Reactive.when(Dialog({ id: "tags", title: "Edit tags" }, TagsForm), shared),
    ),
    yield* pipe(
      when("Moving"),
      Reactive.when(Dialog({ id: "move", title: "Move to a project" }, MoveForm), shared),
    ),
  ]
})

export const Sidebar = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* BoardStore
    const outbox = yield* Outbox.Outbox
    const online = yield* Events.online
    const filter = yield* UiState.make("")
    const editing = yield* UiState.make<Editing>(Editing.Nothing())
    const shown = yield* Reactive.zip(store.select.board, filter)
    const sections = yield* pipe(
      Reactive.map(shown, ([board, text]) => sectionsOf(board, text)),
      Reactive.mapBy(
        (section: Section) => section.key,
        SectionPanel,
        (section, sectionKey) => ({ section, sectionKey, editing }),
      ),
    )

    return {
      filter,
      onFilter: (event: { readonly currentTarget: { readonly value: string } }) =>
        UiState.set(filter, event.currentTarget.value),
      waiting: Reactive.map(store.select.board, needsYou),
      unsent: outbox.pending,
      online: Reactive.map(online, (connected) => (connected ? "Online" : "Offline")),
      idle: Reactive.succeed(false),
      sections,
      onStart: UiState.set(editing, Editing.Starting()),
      onAddProject: UiState.set(editing, Editing.AddingProject()),
      dialogs: yield* dialogs(editing),
    }
  }),
)(SidebarView)
