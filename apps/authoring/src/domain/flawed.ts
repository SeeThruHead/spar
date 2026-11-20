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

export class Increment extends Domain.Command("Increment", {
  input: { counterId: CounterId },
  events: [Incremented],
  rejects: [ResetInProgress],
}) {}

export class Reset extends Domain.Command("Reset", {
  input: { counterId: CounterId },
  events: [ResetStarted],
}) {}

export class FinishReset extends Domain.Command("FinishReset", {
  input: { counterId: CounterId },
  events: [ResetFinished],
}) {}

export class FlawedCounter extends Domain.Aggregate("FlawedCounter", {
  id: CounterId,
  state: State,
  initial: { count: 0, phase: "idle" },
  commands: [Increment, Reset, FinishReset],
  keyOf: (command) => command.counterId,
  decide: {
    Increment: (counter) =>
      counter.phase === "resetting" ? new ResetInProgress() : [new Incremented()],
    Reset: () => [new ResetStarted()],
    FinishReset: () => [new ResetFinished()],
  },
  evolve: {
    Incremented: (counter) => ({ ...counter, count: counter.count + 1 }),
    ResetStarted: (counter) => ({ ...counter, phase: "resetting" as const }),
    ResetFinished: () => ({ count: 0, phase: "idle" as const }),
  },
  invariants: {
    CountIsNeverNegative: (counter) => counter.count >= 0,
  },
  transitions: {
    OnlyItsEndHappensDuringAReset: ({ before, command, events }) =>
      before.phase !== "resetting" || command._tag === "FinishReset" || events.length === 0,
    AResetEndsOnlyOnceStarted: ({ before, command, events }) =>
      command._tag !== "FinishReset" || before.phase === "resetting" || events.length === 0,
  },
}) {}
