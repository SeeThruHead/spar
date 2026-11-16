import { Effect, pipe } from "effect"
import { Handle, Overlay, View } from "spar"
import type { Action } from "spar"
import { DialogView } from "./DialogView.tsx"

export const Dialog = <ContentProps, R = never>(
  frame: { readonly id: string; readonly title: string },
  content: View.Mountable<ContentProps, never, R>,
) =>
  pipe(
    View.connect(
      Effect.fnUntraced(function* (props: ContentProps & { readonly onClose: Action }) {
        const close = yield* Handle.make

        yield* Overlay.modal({ onDismiss: props.onClose, initialFocus: close })

        return {
          id: frame.id,
          title: frame.title,
          close,
          onClose: props.onClose,
          content: yield* View.child(content, props),
        }
      }),
    )(DialogView),
    View.portal,
  )
