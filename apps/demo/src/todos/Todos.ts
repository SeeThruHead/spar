import { Effect, pipe } from "effect"
import { Reactive, UiState, View } from "spar"
import { TodoStore } from "./TodoStore.ts"
import type { Todo } from "./TodoStore.ts"
import { TodoRowView, TodosView } from "./TodosView.tsx"

const TodoRow = View.connect(
  Effect.fnUntraced(function* ({ todo }: { readonly todo: Reactive.Reactive<Todo> }) {
    const store = yield* TodoStore
    const target = Effect.map(todo.get, ({ id }) => ({ id }))

    return {
      todo,
      onToggle: Effect.flatMap(target, store.commands.toggled),
      onRemove: Effect.flatMap(target, store.commands.removed),
    }
  }),
)(TodoRowView)

export const Todos = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* TodoStore
    const draft = yield* UiState.make("")

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
