import { Schema } from "effect"
import { Overlay, View } from "spar"

export const TooltipBubbleView = View.make(
  "TooltipBubbleView",
  { id: Schema.String, text: Schema.String, place: Overlay.Placement },
  ({ id, text, place }) => (
    <div id={id} role="tooltip" class="spar-tooltip" style={place}>
      {text}
    </div>
  ),
)
