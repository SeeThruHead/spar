import { Schema } from "effect"
import { Props, Reactive, UiState, View } from "spar"
import { Todo } from "./TodoStore.ts"

export const TodoRowView = View.make(
  "TodoRowView",
  { todo: Props.Reactive(Todo), onToggle: Props.Action, onRemove: Props.Action },
  ({ todo, onToggle, onRemove }) => (
    <li>
      <label>
        <input
          type="checkbox"
          checked={Reactive.map(todo, (item) => item.done)}
          onChange={onToggle}
        />
        {Reactive.map(todo, (item) => item.title)}
      </label>
      <button onClick={onRemove}>Remove</button>
    </li>
  ),
)

export const TodosView = View.make(
  "TodosView",
  {
    draft: Props.State(Schema.String),
    rows: Props.Element,
    remaining: Props.Reactive(Schema.Finite),
    onAdd: Props.Action,
    onReverse: Props.Action,
  },
  ({ draft, rows, remaining, onAdd, onReverse }) => (
    <section aria-label="Todos">
      <h2>Keyed list</h2>
      <input
        aria-label="New todo"
        placeholder="What needs doing?"
        value={draft}
        onInput={(event) => UiState.set(draft, event.currentTarget.value)}
      />
      <button onClick={onAdd}>Add todo</button>
      <button onClick={onReverse}>Reverse order</button>
      <ul aria-label="Todo list">{rows}</ul>
      <p>
        <output aria-label="Remaining">{remaining}</output> left
      </p>
    </section>
  ),
)
