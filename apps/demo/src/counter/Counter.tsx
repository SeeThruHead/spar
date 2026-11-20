import { compose, withStore } from "spar"
import { CounterStore } from "./CounterStore.ts"

export const Counter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    doubled: store.select.doubled,
    onIncrement: store.commands.incremented({ by: 1 }),
    onReset: store.commands.reset(),
  })),
)((props) => (
  <section aria-label="Counter">
    <h2>Counter</h2>
    <p>
      Count <output aria-label="Count">{props.count}</output>, doubled{" "}
      <output aria-label="Doubled">{props.doubled}</output>
    </p>
    <button onClick={props.onIncrement}>Add one</button>
    <button onClick={props.onReset}>Reset</button>
  </section>
))
