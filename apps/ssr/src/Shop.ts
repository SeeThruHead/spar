import { Context, Effect, Layer, pipe, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Reactive, UiState, View } from "spar"
import { ShopStore } from "./ShopStore.ts"
import type { Item } from "./ShopStore.ts"
import { CountingView, ItemView, ShopView, StockView } from "./ShopView.tsx"

export class Stockroom extends Context.Service<
  Stockroom,
  { readonly count: Effect.Effect<number> }
>()("ssr/Stockroom") {
  static readonly layer = Layer.succeed(Stockroom, {
    count: Effect.as(Effect.sleep("40 millis"), 12),
  })
}

const Stock = pipe(
  View.connect(
    Effect.fnUntraced(function* () {
      const stockroom = yield* Stockroom
      const count = yield* stockroom.count

      return { note: `${count} crates in the stockroom` }
    }),
  )(StockView),
  View.pending(CountingView),
)

export const Shop = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* ShopStore
    const basket = yield* UiState.make("basket", Schema.Finite, 0)

    return {
      count: store.select.count,
      basket,
      items: yield* pipe(
        store.select.items,
        Reactive.mapBy(
          (item: Item) => item.id,
          ItemView,
          (item, id) => ({ item, onRemove: store.commands.removed({ id }) }),
        ),
      ),
      stock: yield* View.child(Stock, {}),
      onAdd: store.commands.stocked({ id: "pears", name: "Pears" }),
      onPick: UiState.update(basket, (now) => now + 1),
    }
  }),
)(ShopView)

export const layer = Layer.merge(ShopStore.layer(), Stockroom.layer).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
)
