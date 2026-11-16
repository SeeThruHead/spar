import type { Action, Element, Handle, Overlay, Reactive } from "spar"

type PanelProps = {
  readonly label: string
  readonly place: Overlay.Placement
  readonly panel: Handle.Handle
  readonly content: Element
}

export const PopoverPanelView = ({ label, place, panel, content }: PanelProps) => (
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
)

type PopoverProps = {
  readonly label: string
  readonly text: string
  readonly trigger: Handle.Handle
  readonly open: Reactive.Reactive<boolean>
  readonly onToggle: Action
  readonly panel: Element
}

export const PopoverView = ({ label, text, trigger, open, onToggle, panel }: PopoverProps) => (
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
)
