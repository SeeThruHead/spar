import { Schema } from "effect"
import { Store } from "spar"

export const Item = Schema.Struct({ id: Schema.String, name: Schema.String })

export type Item = typeof Item.Type

const State = Schema.Struct({ items: Schema.Array(Item) })

type State = typeof State.Type

const initialState: State = {
  items: [
    { id: "apples", name: "Apples" },
    { id: "bread", name: "Bread" },
    { id: "cheese", name: "Cheese & crackers" },
  ],
}

export class ShopStore extends Store.Tag<ShopStore>()("ssr/ShopStore", {
  state: State,
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
    items: Store.selector(Schema.Array(Item), (state: State) => state.items),
    count: Store.selector(Schema.Int, (state: State) => state.items.length),
  },
}) {}
