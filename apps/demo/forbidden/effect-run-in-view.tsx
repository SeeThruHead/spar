import { Effect, Schema } from "effect"
import { Props, View } from "spar"

export const CountView = View.make(
  "CountView",
  { count: Props.Reactive(Schema.Finite) },
  ({ count }) => <output>{Effect.runSync(count.get)}</output>,
)
