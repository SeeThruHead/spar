import { Reactive } from "spar"
import type { Action, Element } from "spar"

export type Item = { readonly id: string; readonly label: string }

type RowProps = {
  readonly item: Reactive.Reactive<Item>
  readonly shared: Reactive.Reactive<string>
  readonly marked: Reactive.Reactive<boolean>
  readonly onPick: Action
}

export const RowView = ({ item, shared, marked, onPick }: RowProps) => (
  <li class={{ marked }}>
    <span>{Reactive.map(item, (current) => current.label)}</span>
    <em>{shared}</em>
    <button type="button" onClick={onPick}>
      Pick
    </button>
  </li>
)

type ListProps = {
  readonly rows: Element
  readonly shared: Reactive.Reactive<string>
  readonly picks: Reactive.Reactive<number>
  readonly onMark: Action
}

export const ListView = ({ rows, shared, picks, onMark }: ListProps) => (
  <section aria-label="Things">
    <p aria-label="Shared">{shared}</p>
    <output aria-label="Picks">{picks}</output>
    <button type="button" onClick={onMark}>
      Mark
    </button>
    <ul>{rows}</ul>
  </section>
)
