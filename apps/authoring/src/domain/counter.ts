import * as Domain from "@alchemy.run/domain"
import { Schema } from "effect"

const CounterId = Schema.String

const State = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

export class Incremented extends Domain.Event("Incremented", {}) {}

export class ResetStarted extends Domain.Event("ResetStarted", {}) {}

export class ResetFinished extends Domain.Event("ResetFinished", {}) {}

export class ResetInProgress extends Domain.Rejection("ResetInProgress", {}) {}

export class NoResetInProgress extends Domain.Rejection("NoResetInProgress", {}) {}

export class Increment extends Domain.Command("Increment", {
  input: { counterId: CounterId },
  events: [Incremented],
  rejects: [ResetInProgress],
  reply: State.fields,
}) {}

export class Reset extends Domain.Command("Reset", {
  input: { counterId: CounterId },
  events: [ResetStarted],
  rejects: [ResetInProgress],
  reply: State.fields,
}) {}

export class FinishReset extends Domain.Command("FinishReset", {
  input: { counterId: CounterId },
  events: [ResetFinished],
  rejects: [NoResetInProgress],
  reply: State.fields,
}) {}

export class Counter extends Domain.Aggregate("Counter", {
  id: CounterId,
  state: State,
  initial: { count: 0, phase: "idle" },
  commands: [Increment, Reset, FinishReset],
  keyOf: (command) => command.counterId,
  decide: {
    Increment: (counter) =>
      counter.phase === "resetting" ? new ResetInProgress() : [new Incremented()],
    Reset: (counter) =>
      counter.phase === "resetting" ? new ResetInProgress() : [new ResetStarted()],
    FinishReset: (counter) =>
      counter.phase === "idle" ? new NoResetInProgress() : [new ResetFinished()],
  },
  evolve: {
    Incremented: (counter) => ({ ...counter, count: counter.count + 1 }),
    ResetStarted: (counter) => ({ ...counter, phase: "resetting" as const }),
    ResetFinished: () => ({ count: 0, phase: "idle" as const }),
  },
  reply: {
    Increment: (counter) => counter,
    Reset: (counter) => counter,
    FinishReset: (counter) => counter,
  },
  invariants: {
    CountIsNeverNegative: (counter) => counter.count >= 0,
  },
  transitions: {
    NothingCountsDuringAReset: ({ before, after }) =>
      before.phase !== "resetting" || after.count === 0 || after.count === before.count,
  },
}) {}

export class CounterModel extends Domain.Model("CounterModel", { aggregates: [Counter] }) {}
