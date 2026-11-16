import { Effect, Stream } from "effect"
import { UiState } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"

export const props = Effect.gen(function* () {
  const store = yield* CounterStore
  const mirror = yield* UiState.make(0)

  yield* Stream.runForEach(store.select.count.changes, (count) => UiState.set(mirror, count))

  return { mirror }
})
