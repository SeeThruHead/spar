import { Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { Stockroom } from "../src/Shop.ts"
import { ShopStore } from "../src/ShopStore.ts"
import { crates, items } from "./database.ts"

export const layer = Layer.merge(
  ShopStore.layerFrom(items()),
  Layer.succeed(Stockroom, { count: crates() }),
).pipe(Layer.provide(SecureRandom.layerWebCrypto))
