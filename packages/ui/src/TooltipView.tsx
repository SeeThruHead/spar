import type { Overlay } from "spar"

type BubbleProps = {
  readonly id: string
  readonly text: string
  readonly place: Overlay.Placement
}

export const TooltipBubbleView = ({ id, text, place }: BubbleProps) => (
  <div id={id} role="tooltip" class="spar-tooltip" style={place}>
    {text}
  </div>
)
