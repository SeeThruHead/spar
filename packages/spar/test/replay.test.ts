import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Exit, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { State as OneState, Store } from "spar"
import * as Testing from "spar/testing"
import { CounterStore } from "./besideEffectUi.test.tsx"

const Tallied = Schema.Struct({ count: Schema.Finite })

type Tallied = typeof Tallied.Type

const adding = Store.action(Schema.Struct({ by: Schema.Finite }), (state: Tallied, { by }) => ({
  count: state.count + by,
}))

class Tally extends Store.Tag<Tally>()("test/ReplayedTally", {
  state: Tallied,
  initialState: { count: 0 },
  actions: { added: adding },
  selectors: {},
}) {}

const broken = {
  definition: {
    ...Tally.definition,
    actions: {
      added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: Tallied, { by }) => ({
        count: state.count + (by >= 10 ? by * 2 : by),
      })),
    },
  },
}

const recorded = Effect.fnUntraced(function* <A, E, R>(work: Effect.Effect<A, E, R>) {
  const inspected = yield* Ref.make<Option.Option<Store.Inspected>>(Option.none())
  const inspector = {
    keepStates: 100,
    register: (store: Store.Inspected) => Ref.set(inspected, Option.some(store)),
  }

  yield* Effect.provideService(work, Store.Inspector, inspector)

  return yield* Option.getOrThrow(yield* Ref.get(inspected)).recording
})

const tallied = recorded(
  Effect.gen(function* () {
    const tally = yield* Tally

    yield* tally.commands.added({ by: 1 })
    yield* tally.commands.added({ by: 10 })
    yield* tally.commands.added({ by: 100 })
  }).pipe(Effect.provide(Tally.layer.pipe(Layer.provideMerge(OneState.layer)))),
)

const replayedFrom = (saved: string) =>
  Effect.flatMap(Schema.decodeEffect(Store.RecordingText)(saved), (recording) =>
    Testing.replay(Tally, recording),
  )

const failureOf = <A, E>(exit: Exit.Exit<A, E>): string =>
  Exit.isFailure(exit) ? String(exit.cause) : "succeeded"

describe("replaying a recorded session as a test", () => {
  it.effect("a recording holds each step's state, and replays to the same state", () =>
    Effect.gen(function* () {
      const recording = yield* tallied

      expect(recording.start).toEqual({ count: 0 })
      expect(recording.steps.map((step) => [step.seq, step.action, step.state])).toEqual([
        [1, "added", { count: 1 }],
        [2, "added", { count: 11 }],
        [3, "added", { count: 111 }],
      ])
      expect(yield* Testing.replay(Tally, recording)).toEqual({ count: 111 })

      const text = yield* Schema.encodeEffect(Store.RecordingText)(recording)

      expect(yield* Schema.decodeEffect(Store.RecordingText)(text)).toEqual(recording)
      expect(yield* replayedFrom(text)).toEqual({ count: 111 })
    }),
  )

  it.effect("replays a task's start and its finish without running the task", () =>
    Effect.gen(function* () {
      const recording = yield* recorded(
        Effect.gen(function* () {
          const counter = yield* CounterStore

          yield* counter.commands.added()
          yield* counter.commands.added()
          yield* counter.tasks.reset()
          yield* TestClock.adjust(Duration.seconds(2))
          yield* counter.commands.added()
        }).pipe(
          Effect.scoped,
          Effect.provide(CounterStore.layer.pipe(Layer.provideMerge(OneState.layer))),
        ),
      )

      expect(recording.steps.map((step) => step.action)).toEqual([
        "added",
        "added",
        "reset",
        "reset finished",
        "added",
      ])
      expect(yield* Testing.replay(CounterStore, recording)).toEqual({ count: 1 })
    }),
  )

  it.effect("names the first step that made a different state, with both states", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Testing.replay(broken, yield* tallied))

      expect(failureOf(exit)).toContain("Step 2 (added) made a different state")
      expect(failureOf(exit)).toContain('Recorded: {"count":11}. Replayed: {"count":21}')
      expect(failureOf(exit)).toContain("SPAR_REPLAY_DIVERGED")
    }),
  )

  it.effect("says which action the store no longer has, and which part no longer reads", () =>
    Effect.gen(function* () {
      const recording = yield* tallied
      const [first] = recording.steps
      const step = Option.getOrThrow(Option.fromUndefinedOr(first))
      const edited = (changed: Partial<Store.Recording>) =>
        Effect.exit(Testing.replay(Tally, { ...recording, ...changed }))

      const unknown = yield* edited({ steps: [{ ...step, action: "removed" }] })
      const badStart = yield* edited({ start: "nothing" })
      const badPayload = yield* edited({ steps: [{ ...step, payload: { by: "one" } }] })
      const badState = yield* edited({ steps: [{ ...step, state: [] }] })

      expect(failureOf(unknown)).toContain("does not define: removed")
      expect(failureOf(badStart)).toContain("no longer read the start state")
      expect(failureOf(badPayload)).toContain("the payload of step 1 (added)")
      expect(failureOf(badState)).toContain("the recorded state of step 1 (added)")
    }),
  )

  it.effect("a store with nothing logged records its state now as the start", () =>
    Effect.gen(function* () {
      const recording = yield* recorded(
        Effect.provide(Effect.asVoid(Tally), Tally.layer.pipe(Layer.provideMerge(OneState.layer))),
      )

      expect(recording).toEqual({ store: "test/ReplayedTally", start: { count: 0 }, steps: [] })
      expect(yield* Testing.replay(Tally, recording)).toEqual({ count: 0 })
    }),
  )
})
