import { Option } from "effect"
import { Reactive, compose, withKey, withStore } from "spar"
import { CounterAggregate } from "../adapter/counter.ts"
import { Increment, Reset } from "../domain/counter.ts"

const counterId = "main"

export const ResetCounter = compose(
  withStore(CounterAggregate, (counter) => ({
    count: Reactive.map(counter.state, (state) => state.count),
    resetting: Reactive.map(counter.state, (state) => state.phase === "resetting"),
    refused: Reactive.map(
      counter.refused,
      Option.match({ onNone: () => "", onSome: (r) => r._tag }),
    ),
    onIncrement: counter.send(new Increment({ counterId })),
    onReset: counter.send(new Reset({ counterId })),
  })),
  withKey("+", (props) => props.onIncrement),
)((props) => (
  <section aria-label="Counter">
    <output>{props.count}</output>
    <button onClick={props.onIncrement}>Add 1</button>
    <button onClick={props.onReset}>Reset after a delay</button>
    <p role="alert">{props.refused}</p>
  </section>
))
