import { Story } from "@alchemy.run/domain/Story"
import * as Verify from "@alchemy.run/domain/Verify"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Domain from "@alchemy.run/domain"
import { Effect, Layer, Option } from "effect"
import { CounterAggregate } from "../src/adapter/counter.ts"
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

  it.effect("read through the adapter, its state and its last rejection are reactive values", () =>
    Effect.gen(function* () {
      const counter = yield* CounterAggregate

      yield* counter.send(new Increment({ counterId: "two" }))
      yield* counter.send(new Reset({ counterId: "two" }))
      yield* counter.send(new Increment({ counterId: "two" }))

      const state = yield* counter.state.get
      const refused = yield* counter.refused.get

      expect([state, Option.map(refused, (rejection) => rejection._tag)]).toEqual([
        { count: 1, phase: "resetting" },
        Option.some("ResetInProgress"),
      ])
    }).pipe(
      Effect.provide(
        CounterAggregate.layer.pipe(
          Layer.provide(CounterModel.layer(Layer.empty)),
          Layer.provide(Domain.InMemory),
        ),
      ),
    ),
  )
})
