import { Effect } from "effect"
import { NotKnown } from "../src/api.ts"
import type { Product, Supplier } from "../src/api.ts"
import type { Item } from "../src/ShopStore.ts"

const shelf: ReadonlyArray<Item> = [
  { id: "apples", name: "Apples" },
  { id: "bread", name: "Bread" },
  { id: "cheese", name: "Cheese & crackers" },
]

const products: ReadonlyArray<Product> = [
  { id: "bread", name: "Bread", supplierId: "mill" },
  { id: "cheese", name: "Cheese & crackers", supplierId: "dairy" },
]

const suppliers: ReadonlyArray<Supplier> = [
  { id: "mill", name: "The mill on the hill" },
  { id: "dairy", name: "Valley dairy" },
]

const known = <A extends { readonly id: string }>(all: ReadonlyArray<A>, id: string) =>
  Effect.andThen(
    Effect.sleep("20 millis"),
    Effect.mapError(
      Effect.fromNullishOr(all.find((one) => one.id === id)),
      () => new NotKnown({ what: id }),
    ),
  )

export const items = Effect.fn("Database.items")(() =>
  Effect.as(Effect.sleep("10 millis"), { items: shelf }),
)

export const crates = Effect.fn("Database.crates")(() => Effect.as(Effect.sleep("40 millis"), 12))

export const product = Effect.fn("Database.product")((id: string) => known(products, id))

export const supplier = Effect.fn("Database.supplier")((id: string) => known(suppliers, id))
