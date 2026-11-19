import { Schema } from "effect"
import { Handle, Overlay, Props, View } from "spar"
import type { Action, Element, Handler, Reactive } from "spar"

export const ListboxOptionView = View.make(
  "ListboxOptionView",
  {
    label: Schema.String,
    handle: Props.Handle,
    selected: Props.Reactive(Schema.Boolean),
    onChoose: Props.Action,
    onKey: Props.Handler("keydown"),
  },
  ({ label, handle, selected, onChoose, onKey }) => (
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
  ),
)

export const ListboxListView = View.make(
  "ListboxListView",
  {
    id: Schema.String,
    label: Schema.String,
    place: Overlay.Placement,
    options: Schema.Array(Props.Element),
  },
  ({ id, label, place, options }) => (
    <ul id={id} role="listbox" class="spar-menu spar-listbox" aria-label={label} style={place}>
      {options}
    </ul>
  ),
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
