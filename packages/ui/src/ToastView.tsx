import type { Action, Element, Reactive } from "spar"

type ToastProps = {
  readonly message: Reactive.Reactive<string>
  readonly tone: Reactive.Reactive<string>
  readonly onDismiss: Action
}

export const ToastView = ({ message, tone, onDismiss }: ToastProps) => (
  <li class="spar-toast" data-tone={tone}>
    <span>{message}</span>
    <button type="button" class="spar-button spar-quiet" onClick={onDismiss}>
      Dismiss
    </button>
  </li>
)

export const ToastsView = ({ toasts }: { readonly toasts: Element }) => (
  <div role="status" aria-live="polite" aria-label="Notifications">
    <ol class="spar-toasts">{toasts}</ol>
  </div>
)
