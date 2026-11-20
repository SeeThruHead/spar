import { Effect, Option, Schema } from "effect"
import { Events, Props, Reactive, View } from "spar"
import type { Store } from "spar"
import { CounterStore, resetAfterDelay } from "../shared/counter.store.ts"

const ResetCounterView = View.make(
  "ResetCounterView",
  {
    count: Props.Reactive(Schema.Int),
    status: Props.Reactive(Schema.String),
    refused: Props.Reactive(Schema.String),
    onIncrement: Props.Action,
    onReset: Props.Action,
  },
  (props) => (
    <section aria-label="Counter">
      <output>{props.count}</output>
      <output>{props.status}</output>
      <button onClick={props.onIncrement}>Add 1</button>
      <button onClick={props.onReset}>Reset after a delay</button>
      <p role="alert">{props.refused}</p>
    </section>
  ),
)

const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, { onNone: () => "", onSome: (refusal) => refusal.reason })

const ResetCounterPanel = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* CounterStore

    yield* Events.onWindow("keydown", (event) =>
      event.key === "+" ? store.commands.incremented() : [],
    )

    return {
      count: store.select.count,
      status: Reactive.map(store.select.resetting, (busy) => (busy ? "Resetting" : "Counting")),
      refused: Reactive.map(store.refused, told),
      onIncrement: store.commands.incremented(),
      onReset: store.commands.resetClicked(),
    }
  }),
)(ResetCounterView)

export const ResetCounter = CounterStore.with(ResetCounterPanel, [resetAfterDelay])
