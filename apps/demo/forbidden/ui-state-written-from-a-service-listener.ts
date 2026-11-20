import { Context, Effect, Layer } from "effect"
import { App, Events, UiState } from "spar"
import { Counter } from "../src/counter/Counter.tsx"
import { CounterStore } from "../src/counter/CounterStore.ts"

class Shortcuts extends Context.Service<Shortcuts, { readonly listening: true }>()(
  "forbidden/Shortcuts",
) {
  static readonly layer = (open: UiState.UiState<boolean>) =>
    Layer.effect(
      Shortcuts,
      Effect.gen(function* () {
        yield* Events.onDocument("keydown", UiState.set(open, false))

        return Shortcuts.of({ listening: true })
      }),
    )
}

export const program = (open: UiState.UiState<boolean>) =>
  App.mount(Counter, {
    target: document.body,
    layer: Layer.merge(CounterStore.layer(), Shortcuts.layer(open)),
  })
