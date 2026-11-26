import { Array, DateTime, Effect, Option, Schema } from "effect"
import { Events, Handle, Props, Reactive, UiState, compose, withProps } from "spar"
import { CalendarDayView, CalendarView, CalendarWeekView } from "./CalendarView.tsx"
import {
  dayIn,
  dayNumber,
  dayTitle,
  indexIn,
  isoDay,
  monthOf,
  monthTitle,
  movedBy,
  shiftedMonth,
} from "./days.ts"
import { focusAt } from "./roving.ts"

const startingDay = (value: string): Effect.Effect<string> =>
  value === "" ? Effect.map(DateTime.now, isoDay) : Effect.succeed(value)

export const Calendar = compose(
  withProps({
    label: Schema.String,
    value: Props.Reactive(Schema.String),
    onChange: Props.Callback(Schema.String),
  }),
  Effect.fnUntraced(function* (props) {
    const first = yield* Effect.flatMap(props.value.get, startingDay)
    const focused = yield* UiState.make("focused", Schema.String, first)
    const handles = yield* Effect.forEach(Array.range(0, 41), () => Handle.make)
    const picked = yield* Reactive.zip(focused, props.value)
    const movedTo = (day: string) => [UiState.set(focused, day), focusAt(handles, indexIn(day))]
    const dayAt = (index: number) => Reactive.map(focused, (day) => dayIn(monthOf(day), index))
    const keyed = Effect.fnUntraced(function* (event: KeyboardEvent) {
      const now = yield* focused.get

      return Option.match(movedBy(event.key, now), {
        onNone: () => [],
        onSome: (day) => [Events.cancel(event), ...movedTo(day)],
      })
    })
    const days = Array.zip(Array.range(0, 41), handles).map(([index, handle]) =>
      CalendarDayView({
        handle,
        day: Reactive.map(dayAt(index), dayNumber),
        title: Reactive.map(dayAt(index), dayTitle),
        outside: Reactive.map(
          focused,
          (day) => monthOf(dayIn(monthOf(day), index)) !== monthOf(day),
        ),
        selected: Reactive.map(picked, ([day, value]) => dayIn(monthOf(day), index) === value),
        tabIndex: Reactive.map(focused, (day) => (dayIn(monthOf(day), index) === day ? 0 : -1)),
        onPick: Effect.map(dayAt(index).get, (day) => [
          props.onChange(day),
          UiState.set(focused, day),
        ]),
        onKey: keyed,
      }),
    )

    return {
      label: props.label,
      title: Reactive.map(focused, (day) => monthTitle(monthOf(day))),
      weeks: Array.chunksOf(days, 7).map((week) => CalendarWeekView({ days: week })),
      onPrevious: UiState.update(focused, (day) => shiftedMonth(day, -1)),
      onNext: UiState.update(focused, (day) => shiftedMonth(day, 1)),
    }
  }),
)(CalendarView)
