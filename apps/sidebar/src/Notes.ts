import { Effect, Schema, pipe } from "effect"
import { Form, Reactive, Store, View } from "spar"
import { NoteLineView, NotesView } from "./NotesView.tsx"

const Note = Schema.Struct({ id: Schema.Int, text: Schema.String })

type Note = typeof Note.Type

const State = Schema.Struct({ notes: Schema.Array(Note) })

type State = typeof State.Type

const counted = (state: State): string =>
  state.notes.length === 1 ? "1 note" : `${state.notes.length} notes`

export class NotesStore extends Store.Tag<NotesStore>()("sidebar/Notes", {
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

const NotesPanel = View.taking(
  { id: Schema.String, title: Schema.String },
  Effect.fnUntraced(function* ({ id, title }) {
    const store = yield* NotesStore
    const form = yield* Form.make(Draft, { text: "" })

    return {
      id,
      title,
      count: store.select.count,
      notes: yield* pipe(
        store.select.notes,
        Reactive.mapBy(
          (note: Note) => String(note.id),
          NoteLineView,
          (note) => ({ text: Reactive.map(note, (now) => now.text) }),
        ),
      ),
      field: form.field("text"),
      busy: form.submitting,
      onSubmit: form.submitThen(({ text }) => store.commands.added(text.trim()), form.reset),
    }
  }),
)(NotesView)

export const Notes = NotesStore.with(NotesPanel)
