import { Effect, Schema } from "effect"
import { Events, For, Form, Model, Reactive, Store, compose, withProps, withStore } from "spar"
import { SubmitButton, TextField } from "@spar/ui"

const Note = Schema.Struct({ id: Schema.Int, text: Schema.String })

type Note = typeof Note.Type

const State = Schema.Struct({ notes: Schema.Array(Note) })

type State = typeof State.Type

const counted = (state: State): string =>
  state.notes.length === 1 ? "1 note" : `${state.notes.length} notes`

export class NotesStore extends Model.Tag<NotesStore>()("sidebar/Notes", {
  state: State,
  initialState: { notes: [] },
  actions: {
    added: Store.action(Schema.String, (state: State, text) => ({
      notes: [...state.notes, { id: state.notes.length + 1, text }],
    })),
  },
  selectors: {
    notes: Store.selector(Schema.Array(Note), (state: State) => state.notes),
    count: Store.selector(Schema.String, counted),
  },
}) {}

const Draft = Schema.Struct({
  text: Schema.String.check(Schema.makeFilter((text) => text.trim().length > 0 || "Write a note")),
})

const withDraft = (props: { readonly onAdd: (text: string) => Effect.Effect<void> }) =>
  Effect.map(Form.make(Draft, { text: "" }), (form) => ({
    field: form.field("text"),
    busy: form.submitting,
    onSubmit: form.submitThen(({ text }) => props.onAdd(text.trim()), form.reset),
  }))

const NotesPanel = compose(
  withProps({ id: Schema.String, title: Schema.String }),
  withStore(NotesStore, (store) => ({
    count: store.select.count,
    notes: store.select.notes,
    onAdd: store.commands.added,
  })),
  withDraft,
)((props) => (
  <section class="notes" aria-label={props.title}>
    <h2>{props.title}</h2>
    <p>
      <output aria-label={`${props.title} count`}>{props.count}</output>
    </p>
    <ul>
      <For each={props.notes} by={(note) => String(note.id)}>
        {(note) => <li>{Reactive.map(note, (now) => now.text)}</li>}
      </For>
    </ul>
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
))

export const Notes = NotesStore.with(NotesPanel)
