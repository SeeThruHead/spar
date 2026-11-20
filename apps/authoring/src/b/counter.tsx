import { Events, Reactive } from "spar"
import { CounterStore, withReset } from "../shared/counter.store.ts"
import * as View from "./View.ts"

export const ResetCounter = View.compose(
  View.service("counter", CounterStore),
  View.bind("reset", () => withReset()),
  View.let("status", ({ counter }) =>
    Reactive.map(counter.select.resetting, (busy) => (busy ? "Resetting" : "Counting")),
  ),
  View.tap(({ counter }) =>
    Events.onWindow("keydown", (event) =>
      event.key === "+" ? counter.commands.incremented() : [],
    ),
  ),
)(({ counter, reset, status }) => (
  <section aria-label="Counter">
    <output>{counter.select.count}</output>
    <output>{status}</output>
    <button onClick={counter.commands.incremented()}>Add 1</button>
    <button onClick={reset.onReset}>Reset after a delay</button>
  </section>
))
