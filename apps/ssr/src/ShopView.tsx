import { Reactive } from "spar"
import type { Action, Element } from "spar"
import type { Item } from "./ShopStore.ts"

type RowProps = {
  readonly item: Reactive.Reactive<Item>
  readonly onRemove: Action
}

export const ItemView = ({ item, onRemove }: RowProps) => (
  <li>
    <span>{Reactive.map(item, (now) => now.name)}</span>{" "}
    <button type="button" onClick={onRemove}>
      Remove {Reactive.map(item, (now) => now.name)}
    </button>
  </li>
)

export const StockView = ({ note }: { readonly note: string }) => <p aria-label="Stock">{note}</p>

export const CountingView = () => <p aria-label="Stock">Counting stock</p>

type ShopProps = {
  readonly count: Reactive.Reactive<number>
  readonly basket: Reactive.Reactive<number>
  readonly items: Element
  readonly stock: Element
  readonly onAdd: Action
  readonly onPick: Action
}

export const ShopView = (props: ShopProps) => (
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
)
