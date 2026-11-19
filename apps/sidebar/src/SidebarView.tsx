import { Schema } from "effect"
import { Events, Form, Props, Reactive, Router, View } from "spar"
import { Button, SubmitButton, TextField } from "@spar/ui"
import { countsOf } from "./domain.ts"
import { Agent, Section } from "./domain.ts"

export const AgentRowView = View.make(
  "AgentRowView",
  {
    id: Schema.String,
    agent: Props.Reactive(Agent),
    lifted: Props.Reactive(Schema.Boolean),
    onLift: Props.Handler("dragstart"),
    onRest: Props.Action,
    link: Router.Link,
    menu: Props.Element,
  },
  ({ id, agent, lifted, onLift, onRest, link, menu }) => (
    <li
      class={{ agent: true, lifted }}
      draggable={true}
      data-agent={id}
      data-status={Reactive.map(agent, (now) => now.status)}
      onDragstart={onLift}
      onDragend={onRest}
    >
      <a href={link.href} onClick={link.onClick}>
        <span class="agent-name">{Reactive.map(agent, (now) => now.name)}</span>
        <span class="agent-status">{Reactive.map(agent, (now) => now.status)}</span>
        <span class="agent-tags">{Reactive.map(agent, (now) => now.tags.join(", "))}</span>
      </a>
      {menu}
    </li>
  ),
)

const fixed = (section: Reactive.Reactive<Section>) => Reactive.map(section, (now) => !now.movable)

export const SectionView = View.make(
  "SectionView",
  {
    section: Props.Reactive(Section),
    rows: Props.Element,
    over: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
    onLift: Props.Handler("dragstart"),
    onRest: Props.Action,
    onOver: Props.Handler("dragstart"),
    onDrop: Props.Handler("dragstart"),
    onUp: Props.Action,
    onDown: Props.Action,
  },
  (props) => (
    <section
      class={{ group: true, "drop-here": props.over }}
      aria-label={Reactive.map(props.section, (now) => now.title)}
      onDragover={props.onOver}
      onDrop={props.onDrop}
    >
      <div
        class="group-head"
        draggable={Reactive.map(props.section, (now) => now.movable)}
        onDragstart={props.onLift}
        onDragend={props.onRest}
      >
        <h2>
          <button
            type="button"
            class="group-toggle"
            aria-expanded={Reactive.map(props.section, (now) => !now.collapsed)}
            onClick={props.onToggle}
          >
            <span>{Reactive.map(props.section, (now) => now.title)}</span>
            <span class="group-count">{Reactive.map(props.section, countsOf)}</span>
          </button>
        </h2>
        <span class="group-moves" hidden={fixed(props.section)}>
          <button
            type="button"
            class="group-move"
            aria-label={Reactive.map(props.section, (now) => `Move ${now.title} up`)}
            onClick={props.onUp}
          >
            ↑
          </button>
          <button
            type="button"
            class="group-move"
            aria-label={Reactive.map(props.section, (now) => `Move ${now.title} down`)}
            onClick={props.onDown}
          >
            ↓
          </button>
        </span>
      </div>
      <ul>{props.rows}</ul>
    </section>
  ),
)

export const SidebarView = View.make(
  "SidebarView",
  {
    filter: Props.Reactive(Schema.String),
    onFilter: Props.Handler("input", "input"),
    waiting: Props.Reactive(Schema.Finite),
    unsent: Props.Reactive(Schema.Finite),
    online: Props.Reactive(Schema.String),
    idle: Props.Reactive(Schema.Boolean),
    sections: Props.Element,
    onStart: Props.Action,
    onAddProject: Props.Action,
    dialogs: Schema.Array(Props.Element),
  },
  (props) => (
    <nav class="sidebar" aria-label="Agents">
      <p class="summary">
        <output aria-label="Waiting on you">{props.waiting}</output> waiting on you
        <span class="summary-net">
          <output aria-label="Connection">{props.online}</output>
          {", "}
          <output aria-label="Not yet sent">{props.unsent}</output> not yet sent
        </span>
      </p>
      <label class="filter">
        Filter agents
        <input type="search" value={props.filter} onInput={props.onFilter} />
      </label>
      <div class="actions">
        <Button
          label="Start an agent"
          tone="primary"
          disabled={props.idle}
          onPress={props.onStart}
        />
        <Button
          label="New project"
          tone="quiet"
          disabled={props.idle}
          onPress={props.onAddProject}
        />
      </div>
      {props.sections}
      {props.dialogs}
    </nav>
  ),
)

export const NameFormView = View.make(
  "NameFormView",
  {
    id: Schema.String,
    label: Schema.String,
    hint: Schema.String,
    action: Schema.String,
    field: Form.Field(Schema.String),
    busy: Props.Reactive(Schema.Boolean),
    onSubmit: Props.Action,
  },
  (props) => (
    <form aria-label={props.label} onSubmit={Events.prevent(props.onSubmit)}>
      <TextField
        id={props.id}
        label={props.label}
        hint={props.hint}
        type="text"
        field={props.field}
      />
      <SubmitButton label={props.action} busy={props.busy} />
    </form>
  ),
)

export const ShellView = View.make(
  "ShellView",
  {
    main: Props.Handle,
    sidebar: Props.Element,
    page: Props.Element,
    scratch: Props.Element,
    counter: Props.Element,
    people: Props.Element,
    toasts: Props.Element,
  },
  ({ main, sidebar, page, scratch, counter, people, toasts }) => (
    <div class="shell">
      {sidebar}
      <main ref={main} tabIndex={-1}>
        {page}
        {scratch}
        {counter}
        {people}
      </main>
      {toasts}
    </div>
  ),
)

export const EmptyPageView = View.make("EmptyPageView", {}, () => (
  <section>
    <h1>Agents</h1>
    <p>Pick an agent from the list to see what it is doing.</p>
  </section>
))

export const MissingPageView = View.make("MissingPageView", { path: Schema.String }, ({ path }) => (
  <section>
    <h1>Nothing here</h1>
    <p role="alert">There is no page at {path}.</p>
  </section>
))

export const ServerRecordView = View.make("ServerRecordView", { key: Schema.String }, ({ key }) => (
  <p aria-label="Server record">The server started this agent as {key}.</p>
))

export const ServerRecordProblemView = View.make(
  "ServerRecordProblemView",
  { error: Schema.Struct({ message: Schema.String }) },
  ({ error }) => <p aria-label="Server record">{error.message}</p>,
)

export const ServerRecordLoadingView = View.make(
  "ServerRecordLoadingView",
  { name: Schema.String },
  ({ name }) => <p aria-label="Server record">Asking the server about {name}.</p>,
)

export const AgentPageView = View.make(
  "AgentPageView",
  {
    record: Props.Element,
    notes: Props.Element,
    name: Props.Reactive(Schema.String),
    status: Props.Reactive(Schema.String),
    project: Props.Reactive(Schema.String),
    tags: Props.Reactive(Schema.String),
    pinLabel: Props.Reactive(Schema.String),
    idle: Props.Reactive(Schema.Boolean),
    onPin: Props.Action,
    home: Router.Link,
  },
  (props) => (
    <section>
      <p>
        <a href={props.home.href} onClick={props.home.onClick}>
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
      {props.record}
      {props.notes}
      <button
        type="button"
        class="spar-button spar-quiet"
        disabled={props.idle}
        onClick={props.onPin}
      >
        {props.pinLabel}
      </button>
    </section>
  ),
)

export const AgentLoadingView = View.make("AgentLoadingView", { id: Schema.String }, ({ id }) => (
  <p role="status">Loading agent {id}</p>
))

const Missing = Schema.TaggedStruct("AgentNotFound", { message: Schema.String })

export const AgentMissingView = View.make("AgentMissingView", { error: Missing }, ({ error }) => (
  <section>
    <h1>Agent not found</h1>
    <p role="alert">{error.message}</p>
  </section>
))

export const MoveFormView = View.make(
  "MoveFormView",
  { choice: Props.Element, busy: Props.Reactive(Schema.Boolean), onSubmit: Props.Action },
  ({ choice, busy, onSubmit }) => (
    <form aria-label="Move to a project" onSubmit={Events.prevent(onSubmit)}>
      {choice}
      <SubmitButton label="Move agent" busy={busy} />
    </form>
  ),
)
