import { Schema } from "effect"
import { Props, View } from "spar"

export const CalendarDayView = View.make(
  "CalendarDayView",
  {
    handle: Props.Handle,
    day: Props.Reactive(Schema.String),
    title: Props.Reactive(Schema.String),
    outside: Props.Reactive(Schema.Boolean),
    selected: Props.Reactive(Schema.Boolean),
    tabIndex: Props.Reactive(Schema.Int),
    onPick: Props.Action,
    onKey: Props.Handler("keydown"),
  },
  (props) => (
    <td role="gridcell" aria-selected={props.selected}>
      <button
        ref={props.handle}
        type="button"
        class={{ "spar-day": true, "spar-day-outside": props.outside }}
        aria-label={props.title}
        tabIndex={props.tabIndex}
        onClick={props.onPick}
        onKeydown={props.onKey}
      >
        {props.day}
      </button>
    </td>
  ),
)

export const CalendarWeekView = View.make(
  "CalendarWeekView",
  { days: Schema.Array(Props.Element) },
  ({ days }) => <tr>{days}</tr>,
)

export const CalendarView = View.make(
  "CalendarView",
  {
    label: Schema.String,
    title: Props.Reactive(Schema.String),
    weeks: Schema.Array(Props.Element),
    onPrevious: Props.Action,
    onNext: Props.Action,
  },
  (props) => (
    <div class="spar-calendar" role="group" aria-label={props.label}>
      <p class="spar-calendar-head">
        <button
          type="button"
          class="spar-button spar-quiet"
          aria-label="Previous month"
          onClick={props.onPrevious}
        >
          ‹
        </button>
        <span class="spar-calendar-title" aria-live="polite">
          {props.title}
        </span>
        <button
          type="button"
          class="spar-button spar-quiet"
          aria-label="Next month"
          onClick={props.onNext}
        >
          ›
        </button>
      </p>
      <table role="grid" aria-label={props.title}>
        <thead>
          <tr>
            <th scope="col" abbr="Sunday">
              Su
            </th>
            <th scope="col" abbr="Monday">
              Mo
            </th>
            <th scope="col" abbr="Tuesday">
              Tu
            </th>
            <th scope="col" abbr="Wednesday">
              We
            </th>
            <th scope="col" abbr="Thursday">
              Th
            </th>
            <th scope="col" abbr="Friday">
              Fr
            </th>
            <th scope="col" abbr="Saturday">
              Sa
            </th>
          </tr>
        </thead>
        <tbody>{props.weeks}</tbody>
      </table>
    </div>
  ),
)
