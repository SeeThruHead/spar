import { Schema } from "effect"
import { Props, View } from "spar"

export const ToastView = View.make(
  "ToastView",
  {
    message: Props.Reactive(Schema.String),
    tone: Props.Reactive(Schema.String),
    onDismiss: Props.Action,
  },
  ({ message, tone, onDismiss }) => (
    <li class="spar-toast" data-tone={tone}>
      <span>{message}</span>
      <button type="button" class="spar-button spar-quiet" onClick={onDismiss}>
        Dismiss
      </button>
    </li>
  ),
)

export const ToastsView = View.make("ToastsView", { toasts: Props.Element }, ({ toasts }) => (
  <div role="status" aria-live="polite" aria-label="Notifications">
    <ol class="spar-toasts">{toasts}</ol>
  </div>
))
