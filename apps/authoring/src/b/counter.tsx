import { Option } from "effect"
import { Events, Reactive } from "spar"
import type { Store } from "spar"
import { CounterStore, resetAfterDelay } from "../shared/counter.store.ts"
import * as View from "./View.ts"

const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, { onNone: () => "", onSome: (refusal) => refusal.reason })

export const ResetCounter = View.compose(
  View.service("counter", CounterStore),
  View.let("status", ({ counter }) =>
    Reactive.map(counter.select.resetting, (busy) => (busy ? "Resetting" : "Counting")),
  ),
  View.let("refused", ({ counter }) => Reactive.map(counter.refused, told)),
  View.tap(({ counter }) =>
    Events.onWindow("keydown", (event) =>
      event.key === "+" ? counter.commands.incremented() : [],
    ),
  ),
  View.react(resetAfterDelay),
)(({ counter, status, refused }) => (
  <section aria-label="Counter">
    <output>{counter.select.count}</output>
    <output>{status}</output>
    <button onClick={counter.commands.incremented()}>Add 1</button>
    <button onClick={counter.commands.resetClicked()}>Reset after a delay</button>
    <p role="alert">{refused}</p>
  </section>
))
