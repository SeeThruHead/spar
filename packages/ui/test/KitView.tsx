import { Schema } from "effect"
import { Events, Form, Props, View } from "spar"
import { Button, Checkbox, SubmitButton, Switch, TextField } from "../src/index.ts"

export const KitView = View.make(
  "KitView",
  {
    name: Form.Field(Schema.String),
    plan: Props.Element,
    news: Form.Field(Schema.Boolean),
    busy: Props.Reactive(Schema.Boolean),
    dark: Props.Reactive(Schema.Boolean),
    never: Props.Reactive(Schema.Boolean),
    saved: Props.Reactive(Schema.String),
    onSubmit: Props.Action,
    onToggleDark: Props.Action,
    onOpen: Props.Action,
    onNotify: Props.Action,
    tabs: Props.Element,
    menu: Props.Element,
    dialog: Props.Element,
    toasts: Props.Element,
  },
  (props) => (
    <main>
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
  ),
)

export const TextView = View.make("TextView", { text: Schema.String }, ({ text }) => <p>{text}</p>)
