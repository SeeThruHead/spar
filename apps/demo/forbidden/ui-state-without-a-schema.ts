import { Effect } from "effect"
import { UiState } from "spar"

export const props = Effect.gen(function* () {
  return { draft: yield* UiState.make("draft", "") }
})
