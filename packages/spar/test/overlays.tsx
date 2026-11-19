import { Schema } from "effect"
import { Overlay, Props, View } from "spar"

export const DialogView = View.make(
  "DialogView",
  {
    title: Schema.String,
    close: Props.Handle,
    onClose: Props.Action,
    onConfirm: Props.Action,
    confirm: Props.Element,
  },
  ({ title, close, onClose, onConfirm, confirm }) => (
    <div role="dialog" aria-modal="true" aria-label={title}>
      <button ref={close} onClick={onClose}>
        Close {title}
      </button>
      <button onClick={onConfirm}>Ask to confirm</button>
      {confirm}
    </div>
  ),
)

export const ConfirmView = View.make("ConfirmView", { onClose: Props.Action }, ({ onClose }) => (
  <div role="alertdialog" aria-modal="true" aria-label="Are you sure?">
    <button onClick={onClose}>Yes</button>
  </div>
))

export const MenuView = View.make(
  "MenuView",
  { place: Overlay.Placement, onPick: Props.Action },
  ({ place, onPick }) => (
    <ul role="menu" aria-label="More" style={place}>
      <li role="none">
        <button role="menuitem" onClick={onPick}>
          Rename
        </button>
      </li>
    </ul>
  ),
)

export const PageView = View.make(
  "PageView",
  {
    more: Props.Handle,
    onOpenDialog: Props.Action,
    onOpenMenu: Props.Action,
    dialog: Props.Element,
    menu: Props.Element,
  },
  ({ more, onOpenDialog, onOpenMenu, dialog, menu }) => (
    <main>
      <button onClick={onOpenDialog}>Open settings</button>
      <button ref={more} onClick={onOpenMenu}>
        More
      </button>
      <p>Somewhere else on the page</p>
      {dialog}
      {menu}
    </main>
  ),
)
