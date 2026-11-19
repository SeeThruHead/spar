import { Array, Effect, Option, pipe, Schema } from "effect"
import { Events, Handle, Overlay, Reactive, UiState, View } from "spar"
import type { Action } from "spar"
import { ListboxListView, ListboxOptionView, ListboxView } from "./ListboxView.tsx"
import { Ids } from "./ids.ts"
import { focusAt, target } from "./roving.ts"

export type Choice = {
  readonly value: string
  readonly label: string
}

type ListProps = {
  readonly id: string
  readonly label: string
  readonly choices: ReadonlyArray<Choice>
  readonly value: Reactive.Reactive<string>
  readonly anchor: Handle.Handle
  readonly onChange: (value: string) => Action
  readonly onClose: Action
}

const startsWith = (choice: Choice, typed: string): boolean =>
  choice.label.toLowerCase().startsWith(typed.toLowerCase())

const typedTo = (
  choices: ReadonlyArray<Choice>,
  typed: string,
  from: number,
): Option.Option<number> =>
  Array.findFirstIndex([...choices.slice(from + 1), ...choices.slice(0, from + 1)], (choice) =>
    startsWith(choice, typed),
  ).pipe(Option.map((offset) => (from + 1 + offset) % choices.length))

const moveTo = (
  choices: ReadonlyArray<Choice>,
  key: string,
  index: number,
): Option.Option<number> =>
  Option.orElse(target(key, index, choices.length), () =>
    key.length === 1 ? typedTo(choices, key, index) : Option.none(),
  )

const choosing: ReadonlySet<string> = new Set(["Enter", " "])

const List = pipe(
  View.connect(
    Effect.fnUntraced(function* (props: ListProps) {
      const handles = yield* Effect.forEach(props.choices, () => Handle.make)
      const place = yield* Overlay.position(props.anchor)
      const current = yield* props.value.get
      const start = Option.getOrElse(
        Array.findFirstIndex(props.choices, (choice) => choice.value === current),
        () => 0,
      )

      yield* Overlay.dismissable({ onDismiss: props.onClose, anchor: props.anchor })
      yield* Effect.forkScoped(
        Effect.forEach(Option.toArray(Array.get(handles, start)), Handle.focus),
      )

      return {
        id: props.id,
        label: props.label,
        place,
        options: Array.zip(props.choices, handles).map(([choice, handle], index) =>
          ListboxOptionView({
            label: choice.label,
            handle,
            selected: Reactive.map(props.value, (value) => value === choice.value),
            onChoose: [props.onChange(choice.value), props.onClose],
            onKey: (event) => {
              if (event.key === "Tab") return props.onClose
              if (choosing.has(event.key)) {
                return [Events.cancel(event), props.onChange(choice.value), props.onClose]
              }

              return Option.match(moveTo(props.choices, event.key, index), {
                onNone: () => [],
                onSome: (next) => focusAt(handles, next),
              })
            },
          }),
        ),
      }
    }),
  )(ListboxListView),
  View.portal,
)

const opening: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp"])

const labelOf = (choices: ReadonlyArray<Choice>, value: string): string =>
  Option.match(
    Array.findFirst(choices, (choice) => choice.value === value),
    { onNone: () => "", onSome: (choice) => choice.label },
  )

export const Listbox = View.connect(
  Effect.fnUntraced(function* (props: {
    readonly label: string
    readonly name: string
    readonly choices: ReadonlyArray<Choice>
    readonly value: Reactive.Reactive<string>
    readonly onChange: (value: string) => Action
  }) {
    const ids = yield* Ids
    const listId = yield* ids.next
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const trigger = yield* Handle.make
    const list = yield* pipe(
      open,
      Reactive.when(List, {
        id: listId,
        label: props.label,
        choices: props.choices,
        value: props.value,
        anchor: trigger,
        onChange: props.onChange,
        onClose: [UiState.set(open, false), Handle.focus(trigger)],
      }),
    )

    return {
      label: props.label,
      listId,
      name: props.name,
      value: props.value,
      shown: Reactive.map(props.value, (value) => labelOf(props.choices, value)),
      trigger,
      open,
      onToggle: UiState.update(open, (shown) => !shown),
      onKey: (event: KeyboardEvent) =>
        opening.has(event.key) ? [Events.cancel(event), UiState.set(open, true)] : [],
      list,
    }
  }),
)(ListboxView)
