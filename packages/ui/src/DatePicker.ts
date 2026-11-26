import { Effect, pipe, Schema } from "effect"
import { Handle, Overlay, Props, Reactive, UiState, View, compose, withProps } from "spar"
import { Calendar } from "./Calendar.ts"
import { DatePickerPanelView, DatePickerView } from "./DatePickerView.tsx"
import { dayTitle } from "./days.ts"

const Panel = pipe(
  compose(
    withProps({
      label: Schema.String,
      value: Props.Reactive(Schema.String),
      anchor: Props.Handle,
      onChange: Props.Callback(Schema.String),
      onClose: Props.Action,
    }),
    Effect.fnUntraced(function* (props) {
      const place = yield* Overlay.position(props.anchor)

      yield* Overlay.dismissable({ onDismiss: props.onClose, anchor: props.anchor })

      return {
        label: props.label,
        place,
        calendar: yield* View.child(Calendar, {
          label: props.label,
          value: props.value,
          autoFocus: true,
          onChange: (day) => [props.onChange(day), props.onClose],
        }),
      }
    }),
  )(DatePickerPanelView),
  View.portal,
)

export const shownDay = (value: string): string => (value === "" ? "Pick a date" : dayTitle(value))

export const DatePicker = compose(
  withProps({
    label: Schema.String,
    name: Schema.String,
    value: Props.Reactive(Schema.String),
    onChange: Props.Callback(Schema.String),
  }),
  Effect.fnUntraced(function* (props) {
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const trigger = yield* Handle.make
    const panel = yield* pipe(
      open,
      Reactive.when(Panel, {
        label: props.label,
        value: props.value,
        anchor: trigger,
        onChange: props.onChange,
        onClose: [UiState.set(open, false), Handle.focus(trigger)],
      }),
    )

    return {
      label: props.label,
      name: props.name,
      value: props.value,
      shown: Reactive.map(props.value, shownDay),
      named: Reactive.map(props.value, (value) => `${props.label}: ${shownDay(value)}`),
      trigger,
      open,
      onToggle: UiState.update(open, (shown) => !shown),
      panel,
    }
  }),
)(DatePickerView)
