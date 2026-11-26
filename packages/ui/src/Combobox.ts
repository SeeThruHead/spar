import { Array, Effect, Option, pipe, Schema } from "effect"
import { Events, Handle, Overlay, Props, Reactive, UiState, View, compose, withProps } from "spar"
import { ComboboxListView, ComboboxOptionView, ComboboxView } from "./ComboboxView.tsx"
import { Ids } from "./ids.ts"
import { Choice } from "./Listbox.ts"
import { target } from "./roving.ts"

export const matching = (choices: ReadonlyArray<Choice>, typed: string): ReadonlyArray<Choice> =>
  choices.filter((choice) => choice.label.toLowerCase().includes(typed.trim().toLowerCase()))

const stepping: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp"])

export const steppedTo = (key: string, active: number, count: number): number => {
  if (count === 0) return -1
  if (active < 0) return key === "ArrowUp" ? count - 1 : 0

  return Option.getOrElse(target(key, active, count), () => active)
}

const labelOf = (choices: ReadonlyArray<Choice>, value: string): string =>
  Option.match(
    Array.findFirst(choices, (choice) => choice.value === value),
    { onNone: () => "", onSome: (choice) => choice.label },
  )

const idOf = (listId: string, choices: ReadonlyArray<Choice>, value: string): string =>
  `${listId}-${choices.findIndex((choice) => choice.value === value)}`

const List = pipe(
  compose(
    withProps({
      id: Schema.String,
      label: Schema.String,
      choices: Schema.Array(Choice),
      shown: Props.Reactive(Schema.Array(Choice)),
      active: Props.Reactive(Schema.Int),
      anchor: Props.Handle,
      onChoose: Props.Callback(Choice),
      onClose: Props.Action,
    }),
    Effect.fnUntraced(function* (props) {
      const place = yield* Overlay.position(props.anchor)
      const seen = yield* Reactive.zip(props.shown, props.active)

      yield* Overlay.dismissable({ onDismiss: props.onClose, anchor: props.anchor })

      return {
        id: props.id,
        label: props.label,
        place,
        options: yield* pipe(
          props.shown,
          Reactive.mapBy(
            (choice: Choice) => choice.value,
            ComboboxOptionView,
            (choice, value) => ({
              id: idOf(props.id, props.choices, value),
              label: labelOf(props.choices, value),
              active: Reactive.map(seen, ([list, index]) => list[index]?.value === value),
              onChoose: Effect.map(choice.get, props.onChoose),
            }),
          ),
        ),
      }
    }),
  )(ComboboxListView),
  View.portal,
)

export const Combobox = compose(
  withProps({
    label: Schema.String,
    name: Schema.String,
    choices: Schema.Array(Choice),
    value: Props.Reactive(Schema.String),
    onChange: Props.Callback(Schema.String),
  }),
  Effect.fnUntraced(function* (props) {
    const ids = yield* Ids
    const listId = yield* ids.next
    const first = yield* props.value.get
    const text = yield* UiState.make("text", Schema.String, labelOf(props.choices, first))
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const active = yield* UiState.make("active", Schema.Int, -1)
    const input = yield* Handle.make
    const shown = Reactive.map(text, (typed) => matching(props.choices, typed))
    const seen = yield* Reactive.zip(shown, active)
    const listed = yield* Reactive.zip(open, shown)
    const closed = [UiState.set(open, false), UiState.set(active, -1)]
    const chose = (choice: Choice) => [
      props.onChange(choice.value),
      UiState.set(text, choice.label),
      ...closed,
      Handle.focus(input),
    ]
    const list = yield* pipe(
      Reactive.map(listed, ([isOpen, all]) => isOpen && all.length > 0),
      Reactive.when(List, {
        id: listId,
        label: props.label,
        choices: props.choices,
        shown,
        active,
        anchor: input,
        onChoose: chose,
        onClose: closed,
      }),
    )
    const keyed = Effect.fnUntraced(function* (event: KeyboardEvent) {
      const [all, index] = yield* seen.get
      const isOpen = yield* open.get

      if (stepping.has(event.key)) {
        return [
          Events.cancel(event),
          UiState.set(open, true),
          UiState.set(active, steppedTo(event.key, isOpen ? index : -1, all.length)),
        ]
      }
      if (event.key === "Escape" && isOpen) return [Events.cancel(event), ...closed]
      if (event.key !== "Enter" || !isOpen) return []

      return Option.match(Array.get(all, index), {
        onNone: () => [],
        onSome: (choice) => [Events.cancel(event), ...chose(choice)],
      })
    })

    return {
      label: props.label,
      listId,
      name: props.name,
      value: props.value,
      text,
      input,
      open: Reactive.map(listed, ([isOpen, all]) => isOpen && all.length > 0),
      activeId: Reactive.map(seen, ([all, index]) =>
        Option.getOrNull(
          Option.map(Array.get(all, index), (choice) => idOf(listId, props.choices, choice.value)),
        ),
      ),
      onText: (typed: string) => [
        UiState.set(text, typed),
        UiState.set(open, true),
        UiState.set(active, 0),
      ],
      onKey: keyed,
      list,
    }
  }),
)(ComboboxView)
