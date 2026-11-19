import { Schema } from "effect"
import { Props, View } from "spar"

export const NoteView = View.make(
  "NoteView",
  { id: Schema.String, text: Props.State(Schema.String), onClear: Props.Action },
  ({ id, text, onClear }) => (
    <li>
      <output aria-label="Note">{text}</output>
      <button onClick={onClear}>Clear {id}</button>
    </li>
  ),
)

export const PanelView = View.make(
  "PanelView",
  { open: Props.State(Schema.Boolean) },
  ({ open }) => <aside hidden={open}>Panel</aside>,
)

export const BoardView = View.make(
  "BoardView",
  {
    title: Props.State(Schema.String),
    notes: Props.Element,
    always: Props.Element,
    sometimes: Props.Element,
  },
  ({ title, notes, always, sometimes }) => (
    <section>
      <h1>{title}</h1>
      <ul>{notes}</ul>
      {always}
      {sometimes}
    </section>
  ),
)

export const TwiceView = View.make(
  "TwiceView",
  { first: Props.State(Schema.String) },
  ({ first }) => <p>{first}</p>,
)
