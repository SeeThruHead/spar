import { Schema } from "effect"
import { Overlay, Props, View } from "spar"
import type { Action } from "spar"

export const ComboboxOptionView = View.make(
  "ComboboxOptionView",
  {
    id: Schema.String,
    label: Schema.String,
    active: Props.Reactive(Schema.Boolean),
    onChoose: Props.Action,
  },
  ({ id, label, active, onChoose }) => (
    <li id={id} role="option" aria-selected={active} onClick={onChoose}>
      {label}
    </li>
  ),
)

export const ComboboxListView = View.make(
  "ComboboxListView",
  {
    id: Schema.String,
    label: Schema.String,
    place: Overlay.Placement,
    options: Props.Element,
  },
  ({ id, label, place, options }) => (
    <ul id={id} role="listbox" class="spar-menu spar-listbox" aria-label={label} style={place}>
      {options}
    </ul>
  ),
)

const typedInto =
  (onText: (text: string) => Action) =>
  (event: { readonly currentTarget: { readonly value: string } }) =>
    onText(event.currentTarget.value)

export const ComboboxView = View.make(
  "ComboboxView",
  {
    label: Schema.String,
    listId: Schema.String,
    name: Schema.String,
    value: Props.Reactive(Schema.String),
    text: Props.State(Schema.String),
    input: Props.Handle,
    open: Props.Reactive(Schema.Boolean),
    activeId: Props.Reactive(Schema.NullOr(Schema.String)),
    onText: Props.Callback(Schema.String),
    onKey: Props.Handler("keydown"),
    list: Props.Element,
  },
  (props) => (
    <span class="spar-anchor">
      <input
        ref={props.input}
        type="text"
        role="combobox"
        class="spar-combobox"
        aria-label={props.label}
        aria-autocomplete="list"
        aria-controls={props.listId}
        aria-expanded={props.open}
        aria-activedescendant={props.activeId}
        autocomplete="off"
        value={props.text}
        onInput={typedInto(props.onText)}
        onKeydown={props.onKey}
      />
      <input type="hidden" name={props.name} value={props.value} />
      {props.list}
    </span>
  ),
)
