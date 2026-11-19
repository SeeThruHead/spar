import { Schema } from "effect"
import { Events, Props, View } from "spar"

export const DialogView = View.make(
  "DialogView",
  {
    id: Schema.String,
    title: Schema.String,
    content: Props.Element,
    close: Props.Handle,
    onClose: Props.Action,
  },
  ({ id, title, content, close, onClose }) => (
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
  ),
)
