import { Effect, pipe } from "effect"
import { Handle, Overlay, Reactive, UiState, View } from "spar"
import type { Action, Element } from "spar"
import { PopoverPanelView, PopoverView } from "./PopoverView.tsx"

type PanelProps = {
  readonly label: string
  readonly content: Element
  readonly anchor: Handle.Handle
  readonly onClose: Action
}

const Panel = pipe(
  View.connect(
    Effect.fnUntraced(function* ({ label, content, anchor, onClose }: PanelProps) {
      const panel = yield* Handle.make
      const place = yield* Overlay.position(anchor)

      yield* Overlay.dismissable({ onDismiss: onClose, anchor })
      yield* Effect.forkScoped(Handle.focus(panel))

      return { label, place, panel, content }
    }),
  )(PopoverPanelView),
  View.portal,
)

export const Popover = View.connect(
  Effect.fnUntraced(function* (props: {
    readonly label: string
    readonly text: string
    readonly content: Element
  }) {
    const open = yield* UiState.make(false)
    const trigger = yield* Handle.make
    const panel = yield* pipe(
      open,
      Reactive.when(Panel, {
        label: props.label,
        content: props.content,
        anchor: trigger,
        onClose: [UiState.set(open, false), Handle.focus(trigger)],
      }),
    )

    return {
      label: props.label,
      text: props.text,
      trigger,
      open,
      onToggle: UiState.update(open, (shown) => !shown),
      panel,
    }
  }),
)(PopoverView)
