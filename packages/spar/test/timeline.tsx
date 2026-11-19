import { Schema } from "effect"
import { Props, UiState, View } from "spar"

export const DeskView = View.make(
  "DeskView",
  {
    count: Props.Reactive(Schema.Finite),
    draft: Props.State(Schema.String),
    onAdd: Props.Action,
    onGo: Props.Action,
  },
  ({ count, draft, onAdd, onGo }) => (
    <main>
      <output aria-label="Count">{count}</output>
      <input
        aria-label="Draft"
        value={draft}
        onInput={(event) => UiState.set(draft, event.currentTarget.value)}
      />
      <button onClick={onAdd}>Add</button>
      <button onClick={onGo}>Go</button>
    </main>
  ),
)
