import { Schema } from "effect"
import { Overlay, Props, View } from "spar"

export const DatePickerPanelView = View.make(
  "DatePickerPanelView",
  { label: Schema.String, place: Overlay.Placement, calendar: Props.Element },
  ({ label, place, calendar }) => (
    <div role="dialog" aria-label={label} class="spar-popover spar-date-panel" style={place}>
      {calendar}
    </div>
  ),
)

export const DatePickerView = View.make(
  "DatePickerView",
  {
    label: Schema.String,
    name: Schema.String,
    value: Props.Reactive(Schema.String),
    shown: Props.Reactive(Schema.String),
    named: Props.Reactive(Schema.String),
    trigger: Props.Handle,
    open: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
    panel: Props.Element,
  },
  (props) => (
    <span class="spar-anchor">
      <span class="spar-date-label" aria-hidden="true">
        {props.label}
      </span>{" "}
      <button
        ref={props.trigger}
        type="button"
        class="spar-button spar-quiet"
        aria-label={props.named}
        aria-haspopup="dialog"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.shown}
      </button>
      <input type="hidden" name={props.name} value={props.value} />
      {props.panel}
    </span>
  ),
)
