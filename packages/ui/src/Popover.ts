import { Effect, pipe, Schema } from "effect"
import { Handle, Overlay, Props, Reactive, UiState, View, compose, withProps } from "spar"
import { PopoverPanelView, PopoverView } from "./PopoverView.tsx"

const Panel = pipe(
  compose(
    withProps({
      label: Schema.String,
      content: Props.Element,
      anchor: Props.Handle,
      onClose: Props.Action,
    }),
    Effect.fnUntraced(function* ({ label, content, anchor, onClose }) {
      const panel = yield* Handle.make
      const place = yield* Overlay.position(anchor)

      yield* Overlay.dismissable({ onDismiss: onClose, anchor })
      yield* Effect.forkScoped(Handle.focus(panel))

      return { label, place, panel, content }
    }),
  )(PopoverPanelView),
  View.portal,
)

export const Popover = compose(
  withProps({ label: Schema.String, text: Schema.String, content: Props.Element }),
  Effect.fnUntraced(function* (props) {
    const open = yield* UiState.make("open", Schema.Boolean, false)
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
