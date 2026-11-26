import { Schema } from "effect"
import { Events, Form, Props, Router, View } from "spar"
import { Button, Checkbox, SubmitButton, Switch, TextField } from "@spar/ui"
import { Tooltip } from "@spar/ui"

export const LinkView = View.make(
  "LinkView",
  { title: Schema.String, link: Router.Link },
  ({ title, link }) => (
    <li>
      <a href={link.href} onClick={link.onClick}>
        {title}
      </a>
    </li>
  ),
)

export const ShellView = View.make(
  "ShellView",
  {
    links: Schema.Array(Props.Element),
    main: Props.Handle,
    page: Props.Element,
    toasts: Props.Element,
  },
  ({ links, main, page, toasts }) => (
    <div class="stories">
      <nav aria-label="Components">
        <ul>{links}</ul>
      </nav>
      <main ref={main} tabIndex={-1}>
        {page}
      </main>
      {toasts}
    </div>
  ),
)

export const WelcomeView = View.make("WelcomeView", {}, () => (
  <section>
    <h1>Spar components</h1>
    <p>Pick a component from the list. Each page is a small working example.</p>
  </section>
))

export const MissingView = View.make("MissingView", { path: Schema.String }, ({ path }) => (
  <section>
    <h1>Nothing here</h1>
    <p role="alert">There is no page at {path}.</p>
  </section>
))

export const ControlsView = View.make(
  "ControlsView",
  {
    name: Form.Field(Schema.String),
    plan: Props.Element,
    news: Form.Field(Schema.Boolean),
    busy: Props.Reactive(Schema.Boolean),
    compact: Props.Reactive(Schema.Boolean),
    idle: Props.Reactive(Schema.Boolean),
    saved: Props.Reactive(Schema.String),
    onSubmit: Props.Action,
    onToggleCompact: Props.Action,
    onReset: Props.Action,
  },
  (props) => (
    <section>
      <h1>Form controls</h1>
      <form aria-label="Profile" onSubmit={Events.prevent(props.onSubmit)}>
        <TextField
          id="name"
          label="Name"
          hint="As it should appear"
          type="text"
          field={props.name}
        />
        {props.plan}
        <Checkbox id="news" label="Send me news" field={props.news} />
        <SubmitButton label="Save profile" busy={props.busy} />
        <Button label="Start over" tone="quiet" disabled={props.idle} onPress={props.onReset} />
      </form>
      <Switch label="Compact layout" on={props.compact} onToggle={props.onToggleCompact} />
      <p>
        Last saved: <output aria-label="Last saved">{props.saved}</output>
      </p>
    </section>
  ),
)

export const TextView = View.make("TextView", { text: Schema.String }, ({ text }) => <p>{text}</p>)

export const TabsStoryView = View.make("TabsStoryView", { tabs: Props.Element }, ({ tabs }) => (
  <section>
    <h1>Tabs</h1>
    {tabs}
  </section>
))

export const MenuStoryView = View.make(
  "MenuStoryView",
  { menu: Props.Element, chosen: Props.Reactive(Schema.String) },
  ({ menu, chosen }) => (
    <section>
      <h1>Menu</h1>
      {menu}
      <p>
        Last choice: <output aria-label="Last choice">{chosen}</output>
      </p>
    </section>
  ),
)

export const DialogStoryView = View.make(
  "DialogStoryView",
  { idle: Props.Reactive(Schema.Boolean), onOpen: Props.Action, dialog: Props.Element },
  ({ idle, onOpen, dialog }) => (
    <section>
      <h1>Dialog</h1>
      <Button label="Open details" tone="primary" disabled={idle} onPress={onOpen} />
      {dialog}
    </section>
  ),
)

export const ToastStoryView = View.make(
  "ToastStoryView",
  { idle: Props.Reactive(Schema.Boolean), onNotify: Props.Action, onWarn: Props.Action },
  ({ idle, onNotify, onWarn }) => (
    <section>
      <h1>Toasts</h1>
      <Button label="Show a notice" tone="primary" disabled={idle} onPress={onNotify} />
      <Button label="Show a problem" tone="danger" disabled={idle} onPress={onWarn} />
    </section>
  ),
)

export const TooltipStoryView = View.make(
  "TooltipStoryView",
  { tip: Tooltip.Tooltip },
  ({ tip }) => (
    <section>
      <h1>Tooltip</h1>
      <button type="button" class="spar-button" {...tip.trigger}>
        Delete project
      </button>
      {tip.bubble}
    </section>
  ),
)

export const PopoverStoryView = View.make(
  "PopoverStoryView",
  { popover: Props.Element },
  ({ popover }) => (
    <section>
      <h1>Popover</h1>
      <p class="at-the-edge">{popover}</p>
    </section>
  ),
)

export const CalendarStoryView = View.make(
  "CalendarStoryView",
  { calendar: Props.Element, day: Props.Reactive(Schema.String) },
  ({ calendar, day }) => (
    <section>
      <h1>Calendar</h1>
      {calendar}
      <p>
        Picked: <output aria-label="Picked day">{day}</output>
      </p>
    </section>
  ),
)

export const ComboboxStoryView = View.make(
  "ComboboxStoryView",
  { combobox: Props.Element, picked: Props.Reactive(Schema.String) },
  ({ combobox, picked }) => (
    <section>
      <h1>Combobox</h1>
      {combobox}
      <p>
        Picked: <output aria-label="Picked fruit">{picked}</output>
      </p>
    </section>
  ),
)

export const ListboxStoryView = View.make(
  "ListboxStoryView",
  { listbox: Props.Element, chosen: Props.Reactive(Schema.String) },
  ({ listbox, chosen }) => (
    <section>
      <h1>Listbox</h1>
      {listbox}
      <p>
        Chosen: <output aria-label="Chosen size">{chosen}</output>
      </p>
    </section>
  ),
)
