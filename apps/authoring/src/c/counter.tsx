import { Schema } from "effect"
import { Counter, Increment, Reset } from "../domain/counter.ts"
import * as View from "./View.ts"

const counterId = "main"

export const ResetCounter = View.compose(
  View.store(Counter, counterId, (counter) => ({
    count: counter.select((state) => state.count),
    resetting: counter.select((state) => state.phase === "resetting"),
    refused: counter.lastRejection,
    onIncrement: counter.send(new Increment({ counterId })),
    onReset: counter.send(new Reset({ counterId })),
  })),
  View.uiState("helpOpen", Schema.Boolean, false),
  View.onKey("+", (props) => props.onIncrement),
)((props) => (
  <section aria-label="Counter">
    <output>{props.count}</output>
    <output>{props.resetting.map((busy) => (busy ? "Resetting" : "Counting"))}</output>
    <button onClick={props.onIncrement}>Add 1</button>
    <button onClick={props.onReset}>Reset after a delay</button>
    <button onClick={props.helpOpen.toggle}>?</button>
    {props.helpOpen.when(<p>Both buttons stay enabled. The store decides.</p>)}
    {props.refused.show((refusal) => (
      <p role="alert">{refusal._tag}</p>
    ))}
  </section>
))
