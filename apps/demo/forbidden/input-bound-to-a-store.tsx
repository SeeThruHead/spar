import { Reactive, compose, withStore } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"

export const CountField = compose(
  withStore(CounterStore, (store) => ({
    count: Reactive.map(store.select.count, String),
    onCount: (typed: string) => store.commands.incremented({ by: Number(typed) }),
  })),
)((props) => (
  <input
    type="number"
    value={props.count}
    onInput={(event) => props.onCount(event.currentTarget.value)}
  />
))
