import { Effect, Schema } from "effect"
import { Props, compose, withHandlers, withProps } from "spar"

export const Draft = compose(
  withProps({ title: Schema.String, initial: Props.Reactive(Schema.String) }),
  (props) =>
    Effect.gen(function* () {
      const first = yield* props.initial.get

      return { first }
    }),
  withHandlers((props) => ({ heading: props.title.toUpperCase() })),
)((props) => (
  <section aria-label={props.title}>
    {props.heading}
    {props.first}
  </section>
))
