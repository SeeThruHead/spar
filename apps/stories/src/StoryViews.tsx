import { Events } from "spar"
import type { Action, Element, Form, Handle, Reactive, Router } from "spar"
import { Button, Checkbox, SubmitButton, Switch, TextField } from "@spar/ui"
import type { Tooltip } from "@spar/ui"

export const LinkView = ({
  title,
  link,
}: {
  readonly title: string
  readonly link: Router.Link
}) => (
  <li>
    <a href={link.href} onClick={link.onClick}>
      {title}
    </a>
  </li>
)

type ShellProps = {
  readonly links: ReadonlyArray<Element>
  readonly main: Handle.Handle
  readonly page: Element
  readonly toasts: Element
}

export const ShellView = ({ links, main, page, toasts }: ShellProps) => (
  <div class="stories">
    <nav aria-label="Components">
      <ul>{links}</ul>
    </nav>
    <main ref={main} tabIndex={-1}>
      {page}
    </main>
    {toasts}
  </div>
)

export const WelcomeView = () => (
  <section>
    <h1>Spar components</h1>
    <p>Pick a component from the list. Each page is a small working example.</p>
  </section>
)

export const MissingView = ({ path }: { readonly path: string }) => (
  <section>
    <h1>Nothing here</h1>
    <p role="alert">There is no page at {path}.</p>
  </section>
)

type ControlsProps = {
  readonly name: Form.Field<string>
  readonly plan: Element
  readonly news: Form.Field<boolean>
  readonly busy: Reactive.Reactive<boolean>
  readonly compact: Reactive.Reactive<boolean>
  readonly idle: Reactive.Reactive<boolean>
  readonly saved: Reactive.Reactive<string>
  readonly onSubmit: Action
  readonly onToggleCompact: Action
  readonly onReset: Action
}

export const ControlsView = (props: ControlsProps) => (
  <section>
    <h1>Form controls</h1>
    <form aria-label="Profile" onSubmit={Events.prevent(props.onSubmit)}>
      <TextField id="name" label="Name" hint="As it should appear" type="text" field={props.name} />
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
)

export const TextView = ({ text }: { readonly text: string }) => <p>{text}</p>

export const TabsStoryView = ({ tabs }: { readonly tabs: Element }) => (
  <section>
    <h1>Tabs</h1>
    {tabs}
  </section>
)

type MenuStoryProps = {
  readonly menu: Element
  readonly chosen: Reactive.Reactive<string>
}

export const MenuStoryView = ({ menu, chosen }: MenuStoryProps) => (
  <section>
    <h1>Menu</h1>
    {menu}
    <p>
      Last choice: <output aria-label="Last choice">{chosen}</output>
    </p>
  </section>
)

type DialogStoryProps = {
  readonly idle: Reactive.Reactive<boolean>
  readonly onOpen: Action
  readonly dialog: Element
}

export const DialogStoryView = ({ idle, onOpen, dialog }: DialogStoryProps) => (
  <section>
    <h1>Dialog</h1>
    <Button label="Open details" tone="primary" disabled={idle} onPress={onOpen} />
    {dialog}
  </section>
)

type ToastStoryProps = {
  readonly idle: Reactive.Reactive<boolean>
  readonly onNotify: Action
  readonly onWarn: Action
}

export const ToastStoryView = ({ idle, onNotify, onWarn }: ToastStoryProps) => (
  <section>
    <h1>Toasts</h1>
    <Button label="Show a notice" tone="primary" disabled={idle} onPress={onNotify} />
    <Button label="Show a problem" tone="danger" disabled={idle} onPress={onWarn} />
  </section>
)

export const TooltipStoryView = ({ tip }: { readonly tip: Tooltip.Tooltip }) => (
  <section>
    <h1>Tooltip</h1>
    <button type="button" class="spar-button" {...tip.trigger}>
      Delete project
    </button>
    {tip.bubble}
  </section>
)

export const PopoverStoryView = ({ popover }: { readonly popover: Element }) => (
  <section>
    <h1>Popover</h1>
    <p class="at-the-edge">{popover}</p>
  </section>
)

type ListboxStoryProps = {
  readonly listbox: Element
  readonly chosen: Reactive.Reactive<string>
}

export const ListboxStoryView = ({ listbox, chosen }: ListboxStoryProps) => (
  <section>
    <h1>Listbox</h1>
    {listbox}
    <p>
      Chosen: <output aria-label="Chosen size">{chosen}</output>
    </p>
  </section>
)
