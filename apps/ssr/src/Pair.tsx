import { Effect, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Reactive, compose, withEffectProps, withHandlers, withProps } from "spar"
import { SupplierQuery } from "./Catalogue.ts"

const withSupplier = withEffectProps(() =>
  Effect.map(SupplierQuery.ask("dairy"), (handle) => ({
    name: Reactive.map(handle.result, (result) =>
      Option.match(AsyncResult.value(result), {
        onNone: () => "waiting",
        onSome: (found) => found.name,
      }),
    ),
  })),
)

const Named = compose(
  withProps({ label: Schema.String }),
  withSupplier,
)((props) => <p aria-label={props.label}>{props.name}</p>)

export const TwoAtOnce = compose(withHandlers(() => ({})))(() => (
  <section>
    <Named label="First" />
    <Named label="Second" />
  </section>
))

const Outer = compose(withSupplier)((props) => (
  <article>
    <h2 aria-label="Outer">{props.name}</h2>
    <Named label="Inner" />
  </article>
))

export const Nested = compose(withHandlers(() => ({})))(() => (
  <section>
    <Outer />
  </section>
))
