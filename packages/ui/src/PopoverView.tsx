import { Schema } from "effect"
import { Overlay, Props, View } from "spar"

export const PopoverPanelView = View.make(
  "PopoverPanelView",
  { label: Schema.String, place: Overlay.Placement, panel: Props.Handle, content: Props.Element },
  ({ label, place, panel, content }) => (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      class="spar-popover"
      style={place}
    >
      {content}
    </div>
  ),
)

export const PopoverView = View.make(
  "PopoverView",
  {
    label: Schema.String,
    text: Schema.String,
    trigger: Props.Handle,
    open: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
    panel: Props.Element,
  },
  ({ label, text, trigger, open, onToggle, panel }) => (
    <span class="spar-anchor">
      <button
        ref={trigger}
        type="button"
        class="spar-button spar-quiet"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onToggle}
      >
        {text}
      </button>
      {panel}
    </span>
  ),
)
