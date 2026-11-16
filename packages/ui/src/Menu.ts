import { Array, Effect, Option, pipe } from "effect"
import { Handle, Overlay, Reactive, UiState, View } from "spar"
import type { Action } from "spar"
import { MenuItemView, MenuListView, MenuView } from "./MenuView.tsx"
import { focusAt, target } from "./roving.ts"

export type Item = {
  readonly label: string
  readonly onChoose: Action
}

type ListProps = {
  readonly label: string
  readonly items: ReadonlyArray<Item>
  readonly anchor: Handle.Handle
  readonly onClose: Action
}

const List = pipe(
  View.connect(
    Effect.fnUntraced(function* ({ label, items, anchor, onClose }: ListProps) {
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

export const Menu = View.connect(
  Effect.fnUntraced(function* (props: {
    readonly label: string
    readonly items: ReadonlyArray<Item>
  }) {
    const open = yield* UiState.make(false)
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
      trigger,
      open,
      onToggle: UiState.update(open, (shown) => !shown),
      list,
    }
  }),
)(MenuView)
