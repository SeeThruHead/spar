import { Effect, Schema } from "effect"
import { UiState } from "spar"
import { TodoStore } from "../src/todos/TodoStore.ts"

export const props = Effect.gen(function* () {
  const store = yield* TodoStore
  const draft = yield* UiState.make("draft", Schema.String, "")

  return { onAdd: store.commands.added({ title: draft }) }
})
