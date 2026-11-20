import { Effect, Schema } from "effect"
import { Reactive, compose, withEffectProps, withHandlers, withProps } from "spar"
import { SupplierQuery } from "../src/Catalogue.ts"

const Named = compose(
  withProps({ label: Schema.String }),
  withEffectProps(() =>
    Effect.map(SupplierQuery.ask("dairy"), (handle) => ({
      name: Reactive.map(handle.value, (found) => found?.name ?? "waiting"),
    })),
  ),
)((props) => <p aria-label={props.label}>{props.name}</p>)

export const Pair = compose(withHandlers(() => ({})))(() => (
  <section>
    <Named label="First" />
    <Named label="Second" />
  </section>
))
