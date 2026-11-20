import { Effect, Layer } from "effect"
import { App, Overlay, compose } from "spar"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const Dialog = compose(
  Effect.fnUntraced(function* () {
    yield* Overlay.modal({ onDismiss: [] })

    return { id: "settings" }
  }),
)(ThreadSkeletonView)

export const program = App.mount(Dialog, { target: document.body, layer: Layer.empty })
