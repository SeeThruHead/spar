import { Context, Effect, Layer } from "effect"
import {
  Counter,
  FinishReset,
  Increment,
  NoResetInProgress,
  Reset,
  ResetInProgress,
} from "../domain/counter.ts"
import { aggregateStore } from "./aggregate.ts"
import type { AggregateStore } from "./aggregate.ts"

type CounterState = { readonly count: number; readonly phase: "idle" | "resetting" }

export class CounterAggregate extends Context.Service<
  CounterAggregate,
  AggregateStore<CounterState, Increment | Reset | FinishReset, ResetInProgress | NoResetInProgress>
>()("authoring/CounterAggregate") {
  static readonly layer = Layer.effect(
    CounterAggregate,
    Effect.gen(function* () {
      const counters = yield* Counter

      return yield* aggregateStore<
        CounterState,
        Increment | Reset | FinishReset,
        ResetInProgress | NoResetInProgress
      >({ count: 0, phase: "idle" }, (command) => counters.send(command))
    }),
  )
}
