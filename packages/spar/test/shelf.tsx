import { Schema } from "effect"
import { Props, Reactive, UiState, View } from "spar"

export const ShelfView = View.make(
  "ShelfView",
  {
    items: Props.Reactive(Schema.Array(Schema.String)),
    note: Props.State(Schema.String),
    onAdd: Props.Action,
  },
  ({ items, note, onAdd }) => (
    <section>
      <output aria-label="Items">{Reactive.map(items, (all) => all.join(", "))}</output>
      <input
        aria-label="Note"
        value={note}
        onInput={(event) => UiState.set(note, event.currentTarget.value)}
      />
      <button onClick={onAdd}>Add tea</button>
    </section>
  ),
)
