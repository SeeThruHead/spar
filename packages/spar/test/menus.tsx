import { Schema } from "effect"
import { Events, Props, UiState, View } from "spar"

export const MenuView = View.make(
  "MenuView",
  { open: Props.State(Schema.Boolean), menu: Props.Element },
  ({ open, menu }) => (
    <div onPointerdown={Events.stop([])}>
      <button aria-expanded={open} onClick={UiState.update(open, (shown) => !shown)}>
        Options
      </button>
      {menu}
    </div>
  ),
)

export const MenuItemsView = View.make("MenuItemsView", {}, () => (
  <ul role="menu" aria-label="Options">
    <li role="menuitem">Rename</li>
  </ul>
))

export const SearchView = View.make(
  "SearchView",
  { searches: Props.Reactive(Schema.Finite), onSearch: Props.Action },
  ({ searches, onSearch }) => (
    <form aria-label="Search" onSubmit={Events.prevent(onSearch)}>
      <button type="submit">Search</button>
      <output aria-label="Searches">{searches}</output>
    </form>
  ),
)

export const StatusView = View.make(
  "StatusView",
  {
    online: Props.Reactive(Schema.String),
    visible: Props.Reactive(Schema.String),
    wide: Props.Reactive(Schema.String),
    resized: Props.Reactive(Schema.String),
    keys: Props.Reactive(Schema.String),
    ticks: Props.Reactive(Schema.Finite),
  },
  ({ online, visible, wide, resized, keys, ticks }) => (
    <section aria-label="Status">
      <output aria-label="Resized">{resized}</output>
      <output aria-label="Online">{online}</output>
      <output aria-label="Visible">{visible}</output>
      <output aria-label="Wide">{wide}</output>
      <output aria-label="Keys">{keys}</output>
      <output aria-label="Ticks">{ticks}</output>
    </section>
  ),
)
