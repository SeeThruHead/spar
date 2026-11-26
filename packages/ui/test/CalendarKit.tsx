import { Schema } from "effect"
import { Props, View } from "spar"

export const CalendarKitView = View.make(
  "CalendarKitView",
  { calendar: Props.Element, day: Props.Reactive(Schema.String) },
  ({ calendar, day }) => (
    <main>
      {calendar}
      <output aria-label="Picked day">{day}</output>
    </main>
  ),
)
