import { Schema } from "effect"
import { Overlay, Props, View } from "spar"

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

export const ListboxView = View.make(
  "ListboxView",
  {
    label: Schema.String,
    listId: Schema.String,
    name: Schema.String,
    value: Props.Reactive(Schema.String),
    shown: Props.Reactive(Schema.String),
    trigger: Props.Handle,
    open: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
    onKey: Props.Handler("keydown"),
    list: Props.Element,
  },
  (props) => (
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
  ),
)
