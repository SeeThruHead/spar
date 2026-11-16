import { Reactive, UiState } from "spar"
import type { Action, Element } from "spar"
import type { Todo } from "./TodoStore.ts"

type RowProps = {
  readonly todo: Reactive.Reactive<Todo>
  readonly onToggle: Action
  readonly onRemove: Action
}

export const TodoRowView = ({ todo, onToggle, onRemove }: RowProps) => (
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
)

type Props = {
  readonly draft: UiState.UiState<string>
  readonly rows: Element
  readonly remaining: Reactive.Reactive<number>
  readonly onAdd: Action
  readonly onReverse: Action
}

export const TodosView = ({ draft, rows, remaining, onAdd, onReverse }: Props) => (
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
)
