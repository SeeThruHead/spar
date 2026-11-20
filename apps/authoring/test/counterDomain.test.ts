import { Story } from "@alchemy.run/domain/Story"
import * as Verify from "@alchemy.run/domain/Verify"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Domain from "@alchemy.run/domain"
import { Effect, Layer } from "effect"
import {
  Counter,
  CounterModel,
  Increment,
  Incremented,
  Reset,
  ResetInProgress,
  ResetStarted,
} from "../src/domain/counter.ts"

const story = Story.make(CounterModel, {})

const counter = Counter.ref("one")

describe("the reset counter as a domain aggregate", () => {
  it.effect("keeps its rules for every state and every command", () =>
    Effect.gen(function* () {
      const report = yield* Verify.aggregate(Counter)

      expect(Verify.render(report)).toMatchInlineSnapshot(`
        "Counter: 2 rules, 3 commands

        Proved: for every state and every input, after any number of commands
          ✓ CountIsNeverNegative
          ✓ NothingCountsDuringAReset
        "
      `)
    }).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("refuses Add 1 during a reset", () =>
    story(
      Story.given(counter, new Incremented({}), new ResetStarted({})),
      Story.when(new Increment({ counterId: counter.id })),
      Story.rejected(new ResetInProgress({})),
    ),
  )

  it.effect(
    "runs in memory: a command replies with the state, and a refusal is a typed error",
    () =>
      Effect.gen(function* () {
        const counters = yield* Counter
        const first = yield* counters.send(new Increment({ counterId: "one" }))
        const second = yield* counters.send(new Reset({ counterId: "one" }))
        const third = yield* Effect.flip(counters.send(new Increment({ counterId: "one" })))

        expect([first.reply, second.reply, third._tag]).toEqual([
          { count: 1, phase: "idle" },
          { count: 1, phase: "resetting" },
          "ResetInProgress",
        ])
      }).pipe(Effect.provide(CounterModel.layer(Layer.empty).pipe(Layer.provide(Domain.InMemory)))),
  )
})
