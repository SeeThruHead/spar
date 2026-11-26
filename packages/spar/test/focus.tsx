import { Schema } from "effect"
import { Props, View } from "spar"

export const PickerView = View.make(
  "PickerView",
  {
    open: Props.State(Schema.Boolean),
    trigger: Props.Handle,
    onOpen: Props.Action,
    options: Props.Element,
    note: Props.Reactive(Schema.String),
    onMeasure: Props.Action,
    onFocusMissing: Props.Action,
    onFocusQuietly: Props.Action,
  },
  (props) => (
    <section aria-label="Picker">
      <button ref={props.trigger} aria-expanded={props.open} onClick={props.onOpen}>
        Pick a colour
      </button>
      {props.options}
      <button onClick={props.onMeasure}>Measure</button>
      <button onClick={props.onFocusMissing}>Focus something missing</button>
      <button onClick={props.onFocusQuietly}>Focus the picker without scrolling</button>
      <output aria-label="Note">{props.note}</output>
    </section>
  ),
)

export const OptionsView = View.make(
  "OptionsView",
  { first: Props.Handle, onClose: Props.Action },
  ({ first, onClose }) => (
    <ul role="listbox" aria-label="Colours">
      <li>
        <button ref={first} role="option" onClick={onClose}>
          Red
        </button>
      </li>
    </ul>
  ),
)
