import type { Action, Element, Handle, Overlay } from "spar"

type DialogProps = {
  readonly title: string
  readonly close: Handle.Handle
  readonly onClose: Action
  readonly onConfirm: Action
  readonly confirm: Element
}

export const DialogView = ({ title, close, onClose, onConfirm, confirm }: DialogProps) => (
  <div role="dialog" aria-modal="true" aria-label={title}>
    <button ref={close} onClick={onClose}>
      Close {title}
    </button>
    <button onClick={onConfirm}>Ask to confirm</button>
    {confirm}
  </div>
)

export const ConfirmView = ({ onClose }: { readonly onClose: Action }) => (
  <div role="alertdialog" aria-modal="true" aria-label="Are you sure?">
    <button onClick={onClose}>Yes</button>
  </div>
)

type MenuProps = {
  readonly place: Overlay.Placement
  readonly onPick: Action
}

export const MenuView = ({ place, onPick }: MenuProps) => (
  <ul role="menu" aria-label="More" style={place}>
    <li role="none">
      <button role="menuitem" onClick={onPick}>
        Rename
      </button>
    </li>
  </ul>
)

type PageProps = {
  readonly more: Handle.Handle
  readonly onOpenDialog: Action
  readonly onOpenMenu: Action
  readonly dialog: Element
  readonly menu: Element
}

export const PageView = ({ more, onOpenDialog, onOpenMenu, dialog, menu }: PageProps) => (
  <main>
    <button onClick={onOpenDialog}>Open settings</button>
    <button ref={more} onClick={onOpenMenu}>
      More
    </button>
    <p>Somewhere else on the page</p>
    {dialog}
    {menu}
  </main>
)
