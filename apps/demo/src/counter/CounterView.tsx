import type { Action, Reactive } from "spar"

type Props = {
  readonly count: Reactive.Reactive<number>
  readonly doubled: Reactive.Reactive<number>
  readonly onIncrement: Action
  readonly onReset: Action
}

export const CounterView = ({ count, doubled, onIncrement, onReset }: Props) => (
  <section aria-label="Counter">
    <h2>Counter</h2>
    <p>
      Count <output aria-label="Count">{count}</output>, doubled{" "}
      <output aria-label="Doubled">{doubled}</output>
    </p>
    <button onClick={onIncrement}>Add one</button>
    <button onClick={onReset}>Reset</button>
  </section>
)
