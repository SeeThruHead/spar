import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref, Schedule, Stream } from "effect"
import { CounterStore } from "./composed.tsx"

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") })

const resetAfterDelay = CounterStore.layerOwn((store) =>
  store.phase.changes.pipe(
    Stream.switchMap((phase) =>
      phase === "resetting"
        ? Stream.fromEffect(
            Effect.andThen(Effect.sleep("30 millis"), store.commands.resetCompleted()),
          )
        : Stream.empty,
    ),
    Stream.runDrain,
  ),
)

describe("a store's own Effect, given to its layer", () => {
  it.live("runs while a phase lasts, and may send the store's internal commands", () =>
    Effect.gen(function* () {
      const store = yield* CounterStore

      yield* store.commands.incremented()
      yield* store.commands.resetClicked()
      expect(yield* store.phase.get).toBe("resetting")

      yield* store.commands.incremented()
      expect(Option.map(yield* store.refused.get, (refusal) => refusal.reason)).toEqual(
        Option.some("it is not accepted while resetting"),
      )

      yield* store.commands.resetCompleted()
      expect(Option.map(yield* store.refused.get, (refusal) => refusal.reason)).toEqual(
        Option.some("it is internal to the store: only the store's own effects may send it"),
      )

      yield* until(store.phase.get, (phase) => phase === "idle")
      expect(yield* store.select.count.get).toBe(0)
    }).pipe(Effect.provide(resetAfterDelay)),
  )

  it.live("hears each accepted command of one action, with its payload and the state after", () =>
    Effect.gen(function* () {
      const heard = yield* Ref.make<ReadonlyArray<number>>([])
      const layer = CounterStore.layerOwn((store) =>
        Stream.runForEach(store.accepted.incremented, ({ state }) =>
          Ref.update(heard, (all) => [...all, state.count]),
        ),
      )

      yield* Effect.provide(
        Effect.gen(function* () {
          const store = yield* CounterStore

          yield* Effect.yieldNow
          yield* store.commands.incremented()
          yield* store.commands.incremented()
          yield* store.commands.resetClicked()
          yield* until(Ref.get(heard), (all) => all.length === 2)
        }),
        layer,
      )

      expect(yield* Ref.get(heard)).toEqual([1, 2])
    }),
  )

  it.live("is interrupted with the store's scope", () =>
    Effect.gen(function* () {
      const stopped = yield* Ref.make(false)
      const layer = CounterStore.layerOwn(() =>
        Effect.onInterrupt(Effect.never, () => Ref.set(stopped, true)),
      )

      yield* Effect.scoped(Layer.build(layer))
      expect(yield* Ref.get(stopped)).toBe(true)
    }),
  )
})
