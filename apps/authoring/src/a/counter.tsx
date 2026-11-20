import { Option } from "effect"
import { Reactive } from "spar"
import type { Store } from "spar"
import { CounterStore, resetAfterDelay } from "../shared/counter.store.ts"
import { compose, withEffect, withKey, withStore } from "./api.ts"

const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, { onNone: () => "", onSome: (refusal) => refusal.reason })

export const ResetCounter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    status: Reactive.map(store.select.resetting, (busy) => (busy ? "Resetting" : "Counting")),
    refused: Reactive.map(store.refused, told),
    onIncrement: store.commands.incremented(),
    onReset: store.commands.resetClicked(),
  })),
  withKey("+", (props) => props.onIncrement),
  withEffect(resetAfterDelay),
)((props) => (
  <section aria-label="Counter">
    <output>{props.count}</output>
    <output>{props.status}</output>
    <button onClick={props.onIncrement}>Add 1</button>
    <button onClick={props.onReset}>Reset after a delay</button>
    <p role="alert">{props.refused}</p>
  </section>
))
