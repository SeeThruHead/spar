import { Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { Router } from "spar"
import { Shelf } from "../src/api.ts"
import { Catalogue, queries } from "../src/Catalogue.ts"
import { Stockroom } from "../src/Shop.ts"
import { ShopStore } from "../src/ShopStore.ts"
import { crates, items, product, supplier } from "./database.ts"

const direct = Layer.succeed(Catalogue, { product, supplier })

export const layer = (url: string) =>
  Layer.mergeAll(
    ShopStore.layerFrom(items()),
    Layer.succeed(Stockroom, { count: crates() }),
    Layer.provide(queries, direct),
  ).pipe(
    Layer.provideMerge(Router.Router.layerMemory(url)),
    Layer.provide(SecureRandom.layerWebCrypto),
  )

export const ShelfLive = Shelf.toLayer({
  Product: ({ id }) => product(id),
  Supplier: ({ id }) => supplier(id),
})
