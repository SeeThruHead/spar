import * as Verify from "@alchemy.run/domain/Verify"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { FlawedCounter } from "../src/domain/flawed.ts"

describe("the counter as first drawn, with Reset and FinishReset unguarded", () => {
  it.effect("is caught by Verify, which prints the shortest way to break each rule", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(Verify.aggregate(FlawedCounter))

      expect(failure.message).toMatchInlineSnapshot(`
        "
        FlawedCounter: 3 rules, 3 commands

        Proved: for every state and every input, after any number of commands
          ✓ CountIsNeverNegative

        ✗ OnlyItsEndHappensDuringAReset breaks
        ✗ AResetEndsOnlyOnceStarted breaks

        FlawedCounter: 1 invariants, 2 transitions, 3 commands

        ✓ The state stays in its schema
            ✓ holds on the initial state
            ✓ proved for Increment, Reset, FinishReset

        ✓ CountIsNeverNegative
            ✓ holds on the initial state
            ✓ proved for Increment, Reset, FinishReset

        ✗ OnlyItsEndHappensDuringAReset
            ✓ proved for Increment, FinishReset
            ✗ Reset: violated
                state    { count: 0, phase: "resetting" }
                command  Reset { counterId: "" }
                now      1970-01-01T00:00:00.000Z
                events   ResetStarted
                after    { count: 0, phase: "resetting" }

        ✗ AResetEndsOnlyOnceStarted
            ✓ proved for Increment, Reset
            ✗ FinishReset: violated
                state    { count: 0, phase: "idle" }
                command  FinishReset { counterId: "" }
                now      1970-01-01T00:00:00.000Z
                events   ResetFinished
                after    { count: 0, phase: "idle" }

        Assuming:
          - whole numbers are exact: a number stays within ±2^53, and a bigint has no limit
          - an event or rejection whose fields fail its schema crashes the command, and nothing is committed

        FlawedCounter: every sequence of up to 3 commands on a new instance
        25 sequences, 32 states

        ✓ CountIsNeverNegative holds in every state: no command can break it
        ✗ OnlyItsEndHappensDuringAReset breaks
            1. Reset { counterId: "" }  → ResetStarted
            2. Reset { counterId: "" }  → ResetStarted
            state  { count: 0, phase: "resetting" }
        ✗ AResetEndsOnlyOnceStarted breaks
            1. FinishReset { counterId: "" }  → ResetFinished
            state  { count: 0, phase: "idle" }

        Reached 4 of 4 outcomes

          Increment → Incremented
              1. Increment { counterId: "" }  → Incremented

          Increment ✗ ResetInProgress
              1. Reset { counterId: "" }      → ResetStarted
              2. Increment { counterId: "" }  → ✗ ResetInProgress

          Reset → ResetStarted
              1. Reset { counterId: "" }  → ResetStarted

          FinishReset → ResetFinished
              1. FinishReset { counterId: "" }  → ResetFinished

        States reached: "
      `)
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})
