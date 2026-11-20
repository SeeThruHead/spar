import { Context, Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, UiState } from "spar"
import { Counter } from "../src/counter/Counter.tsx"
import { CounterStore } from "../src/counter/CounterStore.ts"

class Sidebar extends Context.Service<Sidebar, { readonly open: UiState.UiState<boolean> }>()(
  "forbidden/Sidebar",
) {
  static readonly layer = Layer.effect(
    Sidebar,
    Effect.gen(function* () {
      return Sidebar.of({ open: yield* UiState.make("open", Schema.Boolean, false) })
    }),
  )
}

export const program = App.mount(Counter, {
  target: document.body,
  layer: Layer.merge(CounterStore.layer(), Sidebar.layer).pipe(
    Layer.provide(SecureRandom.layerWebCrypto),
  ),
})
