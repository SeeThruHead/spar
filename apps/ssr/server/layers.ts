import { Effect, Layer } from "effect"
import type { Duration } from "effect"
import { SecureRandom } from "effect/crypto"
import { Router } from "spar"
import { Shelf } from "../src/api.ts"
import { Catalogue, queries } from "../src/Catalogue.ts"
import { Stockroom } from "../src/Shop.ts"
import { ShopStore } from "../src/ShopStore.ts"
import { crates, items, product, supplier } from "./database.ts"

const direct = (supplierTakes: Duration.Input) =>
  Layer.succeed(Catalogue, {
    product,
    supplier: (id: string) => Effect.andThen(Effect.sleep(supplierTakes), supplier(id)),
  })

export const layer = (url: string, supplierTakes: Duration.Input = 0) =>
  Layer.mergeAll(
    ShopStore.layerFrom(items()),
    Layer.succeed(Stockroom, { count: crates() }),
    Layer.provide(queries, direct(supplierTakes)),
  ).pipe(
    Layer.provideMerge(Router.Router.layerMemory(url)),
    Layer.provide(SecureRandom.layerWebCrypto),
  )

export const ShelfLive = Shelf.toLayer({
  Product: ({ id }) => product(id),
  Supplier: ({ id }) => supplier(id),
})
