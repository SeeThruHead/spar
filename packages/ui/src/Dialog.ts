import { Effect, pipe } from "effect"
import type { Scope } from "effect"
import { Handle, Overlay, Props, View, compose, withProps } from "spar"
import type { Element } from "spar"
import { DialogView } from "./DialogView.tsx"

export const Dialog = <R = never>(
  frame: { readonly id: string; readonly title: string },
  content: Effect.Effect<Element, never, R | Scope.Scope>,
) =>
  pipe(
    compose(
      withProps({ onClose: Props.Action }),
      Effect.fnUntraced(function* ({ onClose }) {
        const close = yield* Handle.make

        yield* Overlay.modal({ onDismiss: onClose, initialFocus: close })

        return { id: frame.id, title: frame.title, close, onClose, content: yield* content }
      }),
    )(DialogView),
    View.portal,
  )
