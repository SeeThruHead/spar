import { Events, Reactive } from "spar"
import type { Action, Element, Form, Handle, Handler, Router } from "spar"
import { Button, SubmitButton, TextField } from "@spar/ui"
import { countsOf } from "./domain.ts"
import type { Agent, Section } from "./domain.ts"

type RowProps = {
  readonly id: string
  readonly agent: Reactive.Reactive<Agent>
  readonly lifted: Reactive.Reactive<boolean>
  readonly onLift: Handler<DragEvent>
  readonly onRest: Action
  readonly link: Router.Link
  readonly menu: Element
}

export const AgentRowView = ({ id, agent, lifted, onLift, onRest, link, menu }: RowProps) => (
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
)

type SectionProps = {
  readonly section: Reactive.Reactive<Section>
  readonly rows: Element
  readonly over: Reactive.Reactive<boolean>
  readonly onToggle: Action
  readonly onLift: Handler<DragEvent>
  readonly onRest: Action
  readonly onOver: Handler<DragEvent>
  readonly onDrop: Handler<DragEvent>
  readonly onUp: Action
  readonly onDown: Action
}

const fixed = (section: Reactive.Reactive<Section>) => Reactive.map(section, (now) => !now.movable)

export const SectionView = (props: SectionProps) => (
  <section
    class={{ group: true, "drop-here": props.over }}
    aria-label={Reactive.map(props.section, (now) => now.title)}
    onDragover={props.onOver}
    onDrop={props.onDrop}
  >
    <h2
      draggable={Reactive.map(props.section, (now) => now.movable)}
      onDragstart={props.onLift}
      onDragend={props.onRest}
    >
      <button
        type="button"
        class="group-toggle"
        aria-expanded={Reactive.map(props.section, (now) => !now.collapsed)}
        onClick={props.onToggle}
      >
        <span>{Reactive.map(props.section, (now) => now.title)}</span>
        <span class="group-count">{Reactive.map(props.section, countsOf)}</span>
      </button>
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
    </h2>
    <ul>{props.rows}</ul>
  </section>
)

type SidebarProps = {
  readonly filter: Reactive.Reactive<string>
  readonly onFilter: (event: { readonly currentTarget: { readonly value: string } }) => Action
  readonly waiting: Reactive.Reactive<number>
  readonly unsent: Reactive.Reactive<number>
  readonly online: Reactive.Reactive<string>
  readonly idle: Reactive.Reactive<boolean>
  readonly sections: Element
  readonly onStart: Action
  readonly onAddProject: Action
  readonly dialogs: ReadonlyArray<Element>
}

export const SidebarView = (props: SidebarProps) => (
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
      <Button label="Start an agent" tone="primary" disabled={props.idle} onPress={props.onStart} />
      <Button label="New project" tone="quiet" disabled={props.idle} onPress={props.onAddProject} />
    </div>
    {props.sections}
    {props.dialogs}
  </nav>
)

type NameFormProps = {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly action: string
  readonly field: Form.Field<string>
  readonly busy: Reactive.Reactive<boolean>
  readonly onSubmit: Action
}

export const NameFormView = (props: NameFormProps) => (
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
)

type ShellProps = {
  readonly main: Handle.Handle
  readonly sidebar: Element
  readonly page: Element
  readonly toasts: Element
}

export const ShellView = ({ main, sidebar, page, toasts }: ShellProps) => (
  <div class="shell">
    {sidebar}
    <main ref={main} tabIndex={-1}>
      {page}
    </main>
    {toasts}
  </div>
)

export const EmptyPageView = () => (
  <section>
    <h1>Agents</h1>
    <p>Pick an agent from the list to see what it is doing.</p>
  </section>
)

export const MissingPageView = ({ path }: { readonly path: string }) => (
  <section>
    <h1>Nothing here</h1>
    <p role="alert">There is no page at {path}.</p>
  </section>
)

type AgentPageProps = {
  readonly name: Reactive.Reactive<string>
  readonly status: Reactive.Reactive<string>
  readonly project: Reactive.Reactive<string>
  readonly tags: Reactive.Reactive<string>
  readonly pinLabel: Reactive.Reactive<string>
  readonly idle: Reactive.Reactive<boolean>
  readonly onPin: Action
  readonly home: Router.Link
}

export const AgentPageView = (props: AgentPageProps) => (
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
    <button
      type="button"
      class="spar-button spar-quiet"
      disabled={props.idle}
      onClick={props.onPin}
    >
      {props.pinLabel}
    </button>
  </section>
)

export const AgentLoadingView = ({ id }: { readonly id: string }) => (
  <p role="status">Loading agent {id}</p>
)

type Missing = { readonly _tag: "AgentNotFound"; readonly message: string }

export const AgentMissingView = ({ error }: { readonly error: Missing }) => (
  <section>
    <h1>Agent not found</h1>
    <p role="alert">{error.message}</p>
  </section>
)

type MoveFormProps = {
  readonly choice: Element
  readonly busy: Reactive.Reactive<boolean>
  readonly onSubmit: Action
}

export const MoveFormView = ({ choice, busy, onSubmit }: MoveFormProps) => (
  <form aria-label="Move to a project" onSubmit={Events.prevent(onSubmit)}>
    {choice}
    <SubmitButton label="Move agent" busy={busy} />
  </form>
)
