import { Schema } from "effect"
import { Events, View } from "spar"
import type { Action, Element, Form, Reactive } from "spar"
import { Button, Checkbox, SubmitButton, Switch, TextField } from "../src/index.ts"

type KitProps = {
  readonly name: Form.Field<string>
  readonly plan: Element
  readonly news: Form.Field<boolean>
  readonly busy: Reactive.Reactive<boolean>
  readonly dark: Reactive.Reactive<boolean>
  readonly never: Reactive.Reactive<boolean>
  readonly saved: Reactive.Reactive<string>
  readonly onSubmit: Action
  readonly onToggleDark: Action
  readonly onOpen: Action
  readonly onNotify: Action
  readonly tabs: Element
  readonly menu: Element
  readonly dialog: Element
  readonly toasts: Element
}

export const KitView = (props: KitProps) => (
  <main>
    <form aria-label="Profile" onSubmit={Events.prevent(props.onSubmit)}>
      <TextField id="name" label="Name" hint="As it should appear" type="text" field={props.name} />
      {props.plan}
      <Checkbox id="news" label="Send me news" field={props.news} />
      <SubmitButton label="Save" busy={props.busy} />
    </form>
    <Switch label="Dark mode" on={props.dark} onToggle={props.onToggleDark} />
    <Button label="Open details" tone="primary" disabled={props.never} onPress={props.onOpen} />
    <Button label="Notify" tone="quiet" disabled={props.never} onPress={props.onNotify} />
    <output aria-label="Saved">{props.saved}</output>
    {props.tabs}
    {props.menu}
    {props.dialog}
    {props.toasts}
  </main>
)

export const TextView = View.make("TextView", { text: Schema.String }, ({ text }) => <p>{text}</p>)
