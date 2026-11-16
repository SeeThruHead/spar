import { Effect } from "effect"
import { UiState } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"

export const props = Effect.gen(function* () {
  const store = yield* CounterStore

  return { count: yield* UiState.make(store.select.count) }
})
