import { Effect, pipe, Schema } from "effect"
import { Props, Reactive, UiState, compose, withProps } from "spar"
import { Todo, TodoStore } from "./TodoStore.ts"
import { TodoRowView, TodosView } from "./TodosView.tsx"

const TodoRow = compose(
  withProps({ todo: Props.Reactive(Todo) }),
  Effect.fnUntraced(function* ({ todo }) {
    const store = yield* TodoStore
    const target = Effect.map(todo.get, ({ id }) => ({ id }))

    return {
      todo,
      onToggle: Effect.flatMap(target, store.commands.toggled),
      onRemove: Effect.flatMap(target, store.commands.removed),
    }
  }),
)(TodoRowView)

export const Todos = compose(
  Effect.fnUntraced(function* () {
    const store = yield* TodoStore
    const draft = yield* UiState.make("draft", Schema.String, "")

    const rows = yield* pipe(
      store.select.todos,
      Reactive.mapBy(
        (todo: Todo) => todo.id,
        TodoRow,
        (todo) => ({ todo }),
      ),
    )

    return {
      draft,
      rows,
      remaining: store.select.remaining,
      onAdd: [
        Effect.flatMap(draft.get, (title) => store.commands.added({ title })),
        UiState.set(draft, ""),
      ],
      onReverse: store.commands.reversed(),
    }
  }),
)(TodosView)
