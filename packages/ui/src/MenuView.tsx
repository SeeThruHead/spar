import type { Action, Element, Handle, Handler, Overlay, Reactive } from "spar"

type ItemProps = {
  readonly label: string
  readonly handle: Handle.Handle
  readonly onChoose: Action
  readonly onKey: Handler<KeyboardEvent>
}

export const MenuItemView = ({ label, handle, onChoose, onKey }: ItemProps) => (
  <li role="none">
    <button
      ref={handle}
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onChoose}
      onKeydown={onKey}
    >
      {label}
    </button>
  </li>
)

type ListProps = {
  readonly label: string
  readonly place: Overlay.Placement
  readonly items: ReadonlyArray<Element>
}

export const MenuListView = ({ label, place, items }: ListProps) => (
  <ul role="menu" class="spar-menu" aria-label={label} style={place}>
    {items}
  </ul>
)

type MenuProps = {
  readonly label: string
  readonly trigger: Handle.Handle
  readonly open: Reactive.Reactive<boolean>
  readonly onToggle: Action
  readonly list: Element
}

export const MenuView = ({ label, trigger, open, onToggle, list }: MenuProps) => (
  <span class="spar-menu-anchor">
    <button
      ref={trigger}
      type="button"
      class="spar-button spar-quiet"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
    >
      {label}
    </button>
    {list}
  </span>
)
