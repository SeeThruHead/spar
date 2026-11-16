import type { Action, Element, Handle, Handler, Overlay, Reactive } from "spar"

type OptionProps = {
  readonly label: string
  readonly handle: Handle.Handle
  readonly selected: Reactive.Reactive<boolean>
  readonly onChoose: Action
  readonly onKey: Handler<KeyboardEvent>
}

export const ListboxOptionView = ({ label, handle, selected, onChoose, onKey }: OptionProps) => (
  <li
    ref={handle}
    role="option"
    tabIndex={-1}
    aria-selected={selected}
    onClick={onChoose}
    onKeydown={onKey}
  >
    {label}
  </li>
)

type ListProps = {
  readonly id: string
  readonly label: string
  readonly place: Overlay.Placement
  readonly options: ReadonlyArray<Element>
}

export const ListboxListView = ({ id, label, place, options }: ListProps) => (
  <ul id={id} role="listbox" class="spar-menu spar-listbox" aria-label={label} style={place}>
    {options}
  </ul>
)

type ListboxProps = {
  readonly label: string
  readonly listId: string
  readonly name: string
  readonly value: Reactive.Reactive<string>
  readonly shown: Reactive.Reactive<string>
  readonly trigger: Handle.Handle
  readonly open: Reactive.Reactive<boolean>
  readonly onToggle: Action
  readonly onKey: Handler<KeyboardEvent>
  readonly list: Element
}

export const ListboxView = (props: ListboxProps) => (
  <span class="spar-anchor">
    <button
      ref={props.trigger}
      type="button"
      role="combobox"
      class="spar-button spar-quiet spar-listbox-button"
      aria-label={props.label}
      aria-haspopup="listbox"
      aria-controls={props.listId}
      aria-expanded={props.open}
      onClick={props.onToggle}
      onKeydown={props.onKey}
    >
      {props.shown}
    </button>
    <input type="hidden" name={props.name} value={props.value} />
    {props.list}
  </span>
)
