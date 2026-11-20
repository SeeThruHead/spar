import { Array, Effect, Option, pipe, Schema } from "effect"
import { Handle, Overlay, Props, Reactive, UiState, View, compose, withProps } from "spar"
import { MenuItemView, MenuListView, MenuView } from "./MenuView.tsx"
import { focusAt, target } from "./roving.ts"

export const Item = Schema.Struct({ label: Schema.String, onChoose: Props.Action })

export type Item = typeof Item.Type

const List = pipe(
  compose(
    withProps({
      label: Schema.String,
      items: Schema.Array(Item),
      anchor: Props.Handle,
      onClose: Props.Action,
    }),
    Effect.fnUntraced(function* ({ label, items, anchor, onClose }) {
      const handles = yield* Effect.forEach(items, () => Handle.make)
      const place = yield* Overlay.position(anchor)

      yield* Overlay.dismissable({ onDismiss: onClose, anchor })
      yield* Effect.forkScoped(Effect.forEach(Array.take(handles, 1), Handle.focus))

      return {
        label,
        place,
        items: Array.zip(items, handles).map(([item, handle], index) =>
          MenuItemView({
            label: item.label,
            handle,
            onChoose: [item.onChoose, onClose],
            onKey: (event) => {
              if (event.key === "Tab") return onClose

              return Option.match(target(event.key, index, items.length), {
                onNone: () => [],
                onSome: (next) => focusAt(handles, next),
              })
            },
          }),
        ),
      }
    }),
  )(MenuListView),
  View.portal,
)

export const Menu = compose(
  withProps({ label: Schema.String, text: Schema.String, items: Schema.Array(Item) }),
  Effect.fnUntraced(function* (props) {
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const trigger = yield* Handle.make
    const list = yield* pipe(
      open,
      Reactive.when(List, {
        label: props.label,
        items: props.items,
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
      list,
    }
  }),
)(MenuView)
