import { Reactive } from "spar"
import { CounterStore, withReset } from "../shared/counter.store.ts"
import { compose, withKey, withStore } from "./api.ts"

export const ResetCounter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.select.resetting, (busy) => (busy ? "Resetting" : "Counting")),
    onIncrement: store.commands.incremented(),
  })),
  { run: withReset },
  withKey("+", (props) => props.onIncrement),
)((props) => (
  <section aria-label="Counter">
    <output>{props.count}</output>
    <output>{props.status}</output>
    <button onClick={props.onIncrement}>Add 1</button>
    <button onClick={props.onReset}>Reset after a delay</button>
  </section>
))
