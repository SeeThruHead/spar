import { Effect } from "effect"
import type { Item } from "../src/ShopStore.ts"

const shelf: ReadonlyArray<Item> = [
  { id: "apples", name: "Apples" },
  { id: "bread", name: "Bread" },
  { id: "cheese", name: "Cheese & crackers" },
]

export const items = Effect.fn("Database.items")(() =>
  Effect.as(Effect.sleep("10 millis"), { items: shelf }),
)

export const crates = Effect.fn("Database.crates")(() => Effect.as(Effect.sleep("40 millis"), 12))
