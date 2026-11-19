import { Schema } from "effect"
import { Overlay, Props, View } from "spar"

export const MenuItemView = View.make(
  "MenuItemView",
  {
    label: Schema.String,
    handle: Props.Handle,
    onChoose: Props.Action,
    onKey: Props.Handler("keydown"),
  },
  ({ label, handle, onChoose, onKey }) => (
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
  ),
)

export const MenuListView = View.make(
  "MenuListView",
  { label: Schema.String, place: Overlay.Placement, items: Schema.Array(Props.Element) },
  ({ label, place, items }) => (
    <ul role="menu" class="spar-menu" aria-label={label} style={place}>
      {items}
    </ul>
  ),
)

export const MenuView = View.make(
  "MenuView",
  {
    label: Schema.String,
    text: Schema.String,
    trigger: Props.Handle,
    open: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
    list: Props.Element,
  },
  ({ label, text, trigger, open, onToggle, list }) => (
    <span class="spar-menu-anchor">
      <button
        ref={trigger}
        type="button"
        class="spar-button spar-quiet"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        {text}
      </button>
      {list}
    </span>
  ),
)
