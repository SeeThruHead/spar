import { Schema } from "effect"
import { Store } from "spar"

export type Todo = {
  readonly id: string
  readonly title: string
  readonly done: boolean
}

type State = {
  readonly nextId: number
  readonly todos: ReadonlyArray<Todo>
}

const initialState: State = { nextId: 1, todos: [] }

const Target = Schema.Struct({ id: Schema.String })

export class TodoStore extends Store.Tag<TodoStore>()("demo/todos/TodoStore", {
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ title: Schema.String }), (state: State, { title }) => ({
      nextId: state.nextId + 1,
      todos: [...state.todos, { id: `todo-${state.nextId}`, title, done: false }],
    })),
    toggled: Store.action(Target, (state: State, { id }) => ({
      ...state,
      todos: state.todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
    })),
    removed: Store.action(Target, (state: State, { id }) => ({
      ...state,
      todos: state.todos.filter((todo) => todo.id !== id),
    })),
    reversed: Store.action(Schema.Void, (state: State) => ({
      ...state,
      todos: state.todos.toReversed(),
    })),
  },
  selectors: {
    todos: (state) => state.todos,
    remaining: (state) => state.todos.filter((todo) => !todo.done).length,
  },
}) {}
