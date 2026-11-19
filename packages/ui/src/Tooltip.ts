import { Effect, pipe, Schema } from "effect"
import { Handle, Overlay, Props, Reactive, UiState, View } from "spar"
import { Ids } from "./ids.ts"
import { TooltipBubbleView } from "./TooltipView.tsx"

const Bubble = pipe(
  View.taking(
    { id: Schema.String, text: Schema.String, anchor: Props.Handle },
    Effect.fnUntraced(function* (props) {
      return { id: props.id, text: props.text, place: yield* Overlay.position(props.anchor) }
    }),
  )(TooltipBubbleView),
  View.portal,
)

export const Tooltip = Schema.Struct({
  trigger: Schema.Struct({
    ref: Props.Handle,
    "aria-describedby": Schema.String,
    onPointerenter: Props.Action,
    onPointerleave: Props.Action,
    onFocus: Props.Action,
    onBlur: Props.Action,
    onKeydown: Props.Handler("keydown"),
  }),
  bubble: Props.Element,
})

export type Tooltip = typeof Tooltip.Type

export const make = Effect.fnUntraced(function* (text: string) {
  const ids = yield* Ids
  const id = yield* ids.next
  const shown = yield* UiState.make("shown", Schema.Boolean, false)
  const anchor = yield* Handle.make
  const show = UiState.set(shown, true)
  const hide = UiState.set(shown, false)
  const tooltip: Tooltip = {
    trigger: {
      ref: anchor,
      "aria-describedby": id,
      onPointerenter: show,
      onPointerleave: hide,
      onFocus: show,
      onBlur: hide,
      onKeydown: (event) => (event.key === "Escape" ? hide : []),
    },
    bubble: yield* pipe(shown, Reactive.when(Bubble, { id, text, anchor })),
  }

  return tooltip
})
