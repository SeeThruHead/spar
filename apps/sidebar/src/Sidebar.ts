import { Effect, Option, Schema, pipe } from "effect"
import {
  Events,
  Form,
  Outbox,
  Props,
  Reactive,
  Router,
  UiState,
  View,
  compose,
  withProps,
} from "spar"
import type { Action } from "spar"
import { Dialog, Menu, Select, Toast } from "@spar/ui"
import { BoardStore } from "./BoardStore.ts"
import { Agent, AgentId, Section, SpaceId, needsYou, sectionsOf, tagsOf } from "./domain.ts"
import { agentRoute } from "./routes.ts"
import {
  AgentRowView,
  MoveFormView,
  NameFormView,
  SectionView,
  SidebarView,
} from "./SidebarView.tsx"

const Editing = Schema.TaggedUnion({
  Nothing: {},
  Starting: {},
  AddingProject: {},
  Tagging: { id: AgentId },
  Moving: { id: AgentId },
})

type Editing = typeof Editing.Type

const Dragged = Schema.Struct({ kind: Schema.Literals(["agent", "space"]), id: Schema.String })

type Dragged = typeof Dragged.Type

const Dragging = Schema.Struct({
  dragged: Props.State(Schema.NullOr(Dragged)),
  over: Props.State(Schema.NullOr(Schema.String)),
})

type Dragging = typeof Dragging.Type

const lifted = (kind: Dragged["kind"], id: string): Dragged | null => ({ kind, id })

const carried = (event: DragEvent, id: string): Action =>
  Effect.sync(() => event.dataTransfer?.setData("text/plain", id))

const settled = (dragging: Dragging): Action => [
  UiState.set(dragging.dragged, null),
  UiState.set(dragging.over, null),
]

const agentUnder = (event: DragEvent): AgentId | null => {
  if (!(event.target instanceof Element)) return null

  const id = event.target.closest("[data-agent]")?.getAttribute("data-agent")

  return id === null || id === undefined ? null : AgentId.make(id)
}

const Named = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter((text) => text.trim().length > 0 || "Enter a name")),
})

const noProject = "none"

const rowFields = {
  agent: Props.Reactive(Agent),
  id: Schema.String,
  editing: Props.State(Editing),
  dragging: Dragging,
}

const AgentRow = compose(
  withProps(rowFields),
  Effect.fnUntraced(function* (props: Schema.Struct<typeof rowFields>["Type"]) {
    const store = yield* BoardStore
    const router = yield* Router.Router
    const id = AgentId.make(props.id)
    const first = yield* props.agent.get

    return {
      id: props.id,
      agent: props.agent,
      lifted: Reactive.map(props.dragging.dragged, (now) => now?.id === props.id),
      onLift: (event: DragEvent) => [
        carried(event, props.id),
        UiState.set(props.dragging.dragged, lifted("agent", props.id)),
      ],
      onRest: settled(props.dragging),
      link: router.link(agentRoute, { id: props.id }),
      menu: yield* View.child(Menu, {
        label: `Actions for ${first.name}`,
        text: "Actions",
        items: [
          { label: "Pin or unpin", onChoose: store.commands.pinToggled({ id }) },
          { label: "Edit tags", onChoose: UiState.set(props.editing, { _tag: "Tagging", id }) },
          {
            label: "Move to a project",
            onChoose: UiState.set(props.editing, { _tag: "Moving", id }),
          },
          { label: "Move up", onChoose: store.commands.agentNudged({ id, by: -1 }) },
          { label: "Move down", onChoose: store.commands.agentNudged({ id, by: 1 }) },
        ],
      }),
    }
  }),
)(AgentRowView)

const sectionFields = {
  section: Props.Reactive(Section),
  sectionKey: Schema.String,
  editing: Props.State(Editing),
  dragging: Dragging,
}

const SectionPanel = compose(
  withProps(sectionFields),
  Effect.fnUntraced(function* (props: Schema.Struct<typeof sectionFields>["Type"]) {
    const store = yield* BoardStore
    const space = SpaceId.make(props.sectionKey)
    const rows = yield* pipe(
      Reactive.map(props.section, (section) => section.rows),
      Reactive.mapBy(
        (agent: Agent) => agent.id,
        AgentRow,
        (agent, id) => ({ agent, id, editing: props.editing, dragging: props.dragging }),
      ),
    )
    const dropped = (event: DragEvent) =>
      Effect.flatMap(props.dragging.dragged.get, (now) => {
        if (now === null) return Effect.void
        if (now.kind === "space") {
          return store.commands.spaceDropped({ id: SpaceId.make(now.id), before: props.sectionKey })
        }

        return store.commands.agentDropped({
          id: AgentId.make(now.id),
          section: props.sectionKey,
          before: agentUnder(event),
        })
      })

    return {
      section: props.section,
      rows,
      over: Reactive.map(props.dragging.over, (now) => now === props.sectionKey),
      onToggle: store.commands.sectionToggled({ key: props.sectionKey }),
      onLift: (event: DragEvent) => [
        carried(event, props.sectionKey),
        UiState.set(props.dragging.dragged, lifted("space", props.sectionKey)),
      ],
      onRest: settled(props.dragging),
      onOver: Events.prevent(UiState.set(props.dragging.over, props.sectionKey)),
      onDrop: Events.prevent((event: DragEvent) => [dropped(event), settled(props.dragging)]),
      onUp: store.commands.spaceNudged({ id: space, by: -1 }),
      onDown: store.commands.spaceNudged({ id: space, by: 1 }),
    }
  }),
)(SectionView)

const formFields = { editing: Props.State(Editing), onClose: Props.Action }

type FormProps = Schema.Struct<typeof formFields>["Type"]

const StartForm = compose(
  withProps(formFields),
  Effect.fnUntraced(function* ({ onClose }: FormProps) {
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

const ProjectForm = compose(
  withProps(formFields),
  Effect.fnUntraced(function* ({ onClose }: FormProps) {
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

const TagsForm = compose(
  withProps(formFields),
  Effect.fnUntraced(function* ({ editing, onClose }: FormProps) {
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

const MoveForm = compose(
  withProps(formFields),
  Effect.fnUntraced(function* ({ editing, onClose }: FormProps) {
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
  const onClose = UiState.set(editing, { _tag: "Nothing" })
  const shared = { editing, onClose }
  const closing = { onClose }
  const when = (tag: Editing["_tag"]) => Reactive.map(editing, (now) => now._tag === tag)

  return [
    yield* pipe(
      when("Starting"),
      Reactive.when(
        Dialog({ id: "start", title: "Start an agent" }, View.child(StartForm, shared)),
        closing,
      ),
    ),
    yield* pipe(
      when("AddingProject"),
      Reactive.when(
        Dialog({ id: "project", title: "New project" }, View.child(ProjectForm, shared)),
        closing,
      ),
    ),
    yield* pipe(
      when("Tagging"),
      Reactive.when(
        Dialog({ id: "tags", title: "Edit tags" }, View.child(TagsForm, shared)),
        closing,
      ),
    ),
    yield* pipe(
      when("Moving"),
      Reactive.when(
        Dialog({ id: "move", title: "Move to a project" }, View.child(MoveForm, shared)),
        closing,
      ),
    ),
  ]
})

export const Sidebar = compose(
  Effect.fnUntraced(function* () {
    const store = yield* BoardStore
    const outbox = yield* Outbox.Outbox
    const online = yield* Events.online
    const filter = yield* UiState.make("filter", Schema.String, "")
    const editing = yield* UiState.make("editing", Editing, { _tag: "Nothing" })
    const dragging: Dragging = {
      dragged: yield* UiState.make("dragged", Schema.NullOr(Dragged), null),
      over: yield* UiState.make("over", Schema.NullOr(Schema.String), null),
    }
    const shown = yield* Reactive.zip(store.select.board, filter)
    const sections = yield* pipe(
      Reactive.map(shown, ([board, text]) => sectionsOf(board, text)),
      Reactive.mapBy(
        (section: Section) => section.key,
        SectionPanel,
        (section, sectionKey) => ({ section, sectionKey, editing, dragging }),
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
      onStart: UiState.set(editing, { _tag: "Starting" }),
      onAddProject: UiState.set(editing, { _tag: "AddingProject" }),
      dialogs: yield* dialogs(editing),
    }
  }),
)(SidebarView)
