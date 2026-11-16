import { Effect, pipe } from "effect"
import { Handle, Overlay, View } from "spar"
import type { Action, Element } from "spar"
import { DialogView } from "./DialogView.tsx"

export const Dialog = pipe(
  View.connect(
    Effect.fnUntraced(function* (props: {
      readonly id: string
      readonly title: string
      readonly content: Element
      readonly onClose: Action
    }) {
      const close = yield* Handle.make

      yield* Overlay.modal({ onDismiss: props.onClose, initialFocus: close })

      return { ...props, close }
    }),
  )(DialogView),
  View.portal,
)
