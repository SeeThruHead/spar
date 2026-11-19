import { Schema } from "effect"
import { Events, Form, Props, View } from "spar"
import { SubmitButton, TextField } from "@spar/ui"

export const NoteLineView = View.make(
  "NoteLineView",
  { text: Props.Reactive(Schema.String) },
  ({ text }) => <li>{text}</li>,
)

export const NotesView = View.make(
  "NotesView",
  {
    id: Schema.String,
    title: Schema.String,
    count: Props.Reactive(Schema.String),
    notes: Props.Element,
    field: Form.Field(Schema.String),
    busy: Props.Reactive(Schema.Boolean),
    onSubmit: Props.Action,
  },
  (props) => (
    <section class="notes" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>
        <output aria-label={`${props.title} count`}>{props.count}</output>
      </p>
      <ul>{props.notes}</ul>
      <form aria-label={`Add to ${props.title}`} onSubmit={Events.prevent(props.onSubmit)}>
        <TextField
          id={props.id}
          label="Note"
          hint={`Kept in ${props.title}`}
          type="text"
          field={props.field}
        />
        <SubmitButton label="Add note" busy={props.busy} />
      </form>
    </section>
  ),
)
