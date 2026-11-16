import { Events } from "spar"
import type { Action, Element, Handle } from "spar"

type DialogProps = {
  readonly id: string
  readonly title: string
  readonly content: Element
  readonly close: Handle.Handle
  readonly onClose: Action
}

export const DialogView = ({ id, title, content, close, onClose }: DialogProps) => (
  <div class="spar-backdrop" onClick={onClose}>
    <div
      class="spar-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onClick={Events.stop([])}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {content}
      <button ref={close} type="button" class="spar-button spar-quiet" onClick={onClose}>
        Close
      </button>
    </div>
  </div>
)
