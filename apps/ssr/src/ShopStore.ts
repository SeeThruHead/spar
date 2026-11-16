import { Schema } from "effect"
import { Store } from "spar"

export const Item = Schema.Struct({ id: Schema.String, name: Schema.String })

export type Item = typeof Item.Type

type State = { readonly items: ReadonlyArray<Item> }

const initialState: State = {
  items: [
    { id: "apples", name: "Apples" },
    { id: "bread", name: "Bread" },
    { id: "cheese", name: "Cheese & crackers" },
  ],
}

export class ShopStore extends Store.Tag<ShopStore>()("ssr/ShopStore", {
  initialState,
  actions: {
    stocked: Store.action(Item, (state: State, item) => ({
      items: [...state.items.filter((found) => found.id !== item.id), item],
    })),
    removed: Store.action(Schema.Struct({ id: Schema.String }), (state: State, { id }) => ({
      items: state.items.filter((found) => found.id !== id),
    })),
  },
  selectors: {
    items: (state) => state.items,
    count: (state) => state.items.length,
  },
}) {}
