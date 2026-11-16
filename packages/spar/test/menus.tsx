import { Events, UiState } from "spar"
import type { Action, Element, Reactive } from "spar"

type MenuProps = {
  readonly open: UiState.UiState<boolean>
  readonly menu: Element
}

export const MenuView = ({ open, menu }: MenuProps) => (
  <div onPointerdown={Events.stop([])}>
    <button aria-expanded={open} onClick={UiState.update(open, (shown) => !shown)}>
      Options
    </button>
    {menu}
  </div>
)

export const MenuItemsView = () => (
  <ul role="menu" aria-label="Options">
    <li role="menuitem">Rename</li>
  </ul>
)

type SearchProps = {
  readonly searches: Reactive.Reactive<number>
  readonly onSearch: Action
}

export const SearchView = ({ searches, onSearch }: SearchProps) => (
  <form aria-label="Search" onSubmit={Events.prevent(onSearch)}>
    <button type="submit">Search</button>
    <output aria-label="Searches">{searches}</output>
  </form>
)

type StatusProps = {
  readonly online: Reactive.Reactive<string>
  readonly visible: Reactive.Reactive<string>
  readonly wide: Reactive.Reactive<string>
  readonly resized: Reactive.Reactive<string>
  readonly keys: Reactive.Reactive<string>
  readonly ticks: Reactive.Reactive<number>
}

export const StatusView = ({ online, visible, wide, resized, keys, ticks }: StatusProps) => (
  <section aria-label="Status">
    <output aria-label="Resized">{resized}</output>
    <output aria-label="Online">{online}</output>
    <output aria-label="Visible">{visible}</output>
    <output aria-label="Wide">{wide}</output>
    <output aria-label="Keys">{keys}</output>
    <output aria-label="Ticks">{ticks}</output>
  </section>
)
