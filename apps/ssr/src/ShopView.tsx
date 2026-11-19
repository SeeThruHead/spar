import { Schema } from "effect"
import { Props, Reactive, View } from "spar"
import { Item } from "./ShopStore.ts"

export const ItemView = View.make(
  "ItemView",
  { item: Props.Reactive(Item), onRemove: Props.Action },
  ({ item, onRemove }) => (
    <li>
      <span>{Reactive.map(item, (now) => now.name)}</span>{" "}
      <button type="button" onClick={onRemove}>
        Remove {Reactive.map(item, (now) => now.name)}
      </button>
    </li>
  ),
)

export const StockView = View.make("StockView", { note: Schema.String }, ({ note }) => (
  <p aria-label="Stock">{note}</p>
))

export const CountingView = View.make("CountingView", {}, () => (
  <p aria-label="Stock">Counting stock</p>
))

export const ShopView = View.make(
  "ShopView",
  {
    count: Props.Reactive(Schema.Finite),
    basket: Props.Reactive(Schema.Finite),
    items: Props.Element,
    stock: Props.Element,
    onAdd: Props.Action,
    onPick: Props.Action,
  },
  (props) => (
    <main>
      <h1>Corner shop</h1>
      <p>
        <output aria-label="Kinds">{props.count}</output> kinds on the shelf,{" "}
        <output aria-label="Basket">{props.basket}</output> in your basket
      </p>
      <button type="button" onClick={props.onPick}>
        Put one in the basket
      </button>
      <button type="button" onClick={props.onAdd}>
        Stock pears
      </button>
      <ul aria-label="Shelf">{props.items}</ul>
      {props.stock}
    </main>
  ),
)
