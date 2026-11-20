import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, FiberHandle, Layer, Schedule, Schema, Scope } from "effect"
import { KeyValueStore } from "effect/persistence"
import { Reactive, compose } from "spar"
import * as Testing from "spar/testing"
import { pathOf, ViewScope } from "../src/internal/viewScope.ts"
import * as State from "../src/State.ts"

const Counting = Schema.Struct({ count: Schema.Int, resetting: Schema.Boolean })

class Counter extends Context.Service<
  Counter,
  {
    readonly count: Reactive.Reactive<number>
    readonly resetting: Reactive.Reactive<boolean>
    readonly increment: Effect.Effect<void>
    readonly reset: Effect.Effect<void>
  }
>()("test/Counter") {
  static readonly layer = Layer.effect(
    Counter,
    Effect.gen(function* () {
      const state = yield* State.State
      const slot = yield* state.slot(["Counter"], Counting, { count: 0, resetting: false })
      const resets = yield* FiberHandle.make()

      return {
        count: Reactive.map(slot.value, (now) => now.count),
        resetting: Reactive.map(slot.value, (now) => now.resetting),
        increment: slot.update("incremented", (now) => ({ ...now, count: now.count + 1 })),
        reset: Effect.asVoid(
          FiberHandle.run(
            resets,
            Effect.gen(function* () {
              yield* slot.update("resetClicked", (now) => ({ ...now, resetting: true }))
              yield* Effect.sleep("30 millis")
              yield* slot.set("resetCompleted", { count: 0, resetting: false })
            }),
            { onlyIfMissing: true },
          ),
        ),
      }
    }),
  )
}

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") })

const counting = Effect.fn("counting")(function* (_props: unknown) {
  const state = yield* State.State
  const mounted = yield* ViewScope
  const slot = yield* state.slot([...pathOf(mounted), "count"], Schema.Int, 0)

  return { count: slot.value, onAdd: slot.update("incremented", (count) => count + 1) }
})

const LocalCounter = compose(counting)((props) => (
  <button onClick={props.onAdd}>Clicked {props.count} times</button>
))

describe("one state for everything", () => {
  it.live("a store is a service over a slot; a second reset while one runs is ignored", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      const state = yield* State.State

      yield* counter.increment
      yield* counter.increment
      yield* counter.reset
      yield* counter.reset
      expect(yield* counter.resetting.get).toBe(true)

      yield* until(counter.resetting.get, (resetting) => !resetting)
      expect(yield* counter.count.get).toBe(0)
      expect((yield* state.log.get).map((entry) => entry.name)).toEqual([
        "incremented",
        "incremented",
        "resetClicked",
        "resetCompleted",
      ])
    }).pipe(Effect.provide(Counter.layer.pipe(Layer.provideMerge(State.layer)))),
  )

  it.live("saving is a layer around whatever should be saved: the count survives a restart", () =>
    Effect.gen(function* () {
      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const started = Counter.layer.pipe(
        Layer.provide(State.saved),
        Layer.provide(State.layer),
        Layer.provide(Layer.succeedContext(storage)),
      )
      const countedTwice = Effect.gen(function* () {
        const counter = yield* Counter

        yield* counter.increment
        yield* counter.increment
      })

      yield* Effect.scoped(Effect.provide(countedTwice, started))

      const after = yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(Counter, (counter) => counter.count.get),
          started,
        ),
      )

      expect(after).toBe(2)
    }),
  )

  it.live("a component's own slot sits at its path in the same log, and goes when it does", () =>
    Effect.gen(function* () {
      const state = yield* State.State
      const scope = yield* Scope.make()

      yield* Scope.provide(Testing.mount(LocalCounter), scope)
      yield* Testing.click("button", "Clicked 0 times")
      yield* Testing.findText("Clicked 1 times")

      const [written] = yield* state.log.get

      expect([written?.key, written?.name, written?.value]).toEqual([
        "LocalCounter / count",
        "incremented",
        1,
      ])
      expect([...(yield* state.tree.get).keys()]).toEqual(["LocalCounter / count"])

      yield* Scope.close(scope, Exit.void)
      expect([...(yield* state.tree.get).keys()]).toEqual([])
    }).pipe(Effect.provide(State.layer)),
  )

  it.effect("two holders of one key share it, and it stays until the last one leaves", () =>
    Effect.gen(function* () {
      const state = yield* State.State
      const first = yield* Scope.make()
      const second = yield* Scope.make()
      const one = yield* Scope.provide(state.slot(["shared"], Schema.String, "a"), first)
      const two = yield* Scope.provide(state.slot(["shared"], Schema.String, "z"), second)

      yield* one.set("changed", "b")
      expect(yield* two.value.get).toBe("b")

      yield* Scope.close(first, Exit.void)
      expect([...(yield* state.tree.get).entries()]).toEqual([["shared", "b"]])

      yield* Scope.close(second, Exit.void)
      expect((yield* state.tree.get).size).toBe(0)
    }).pipe(Effect.provide(State.layer)),
  )

  it.effect("a slot defined once is used by its value, and each write carries its trace", () =>
    Effect.gen(function* () {
      const state = yield* State.State
      const theme = yield* Theme

      yield* Effect.withSpan(theme.set("chosen", "dark"), "choose theme")

      const [written] = yield* state.log.get

      expect([written?.key, written?.name, written?.value]).toEqual(["app/Theme", "chosen", "dark"])
      expect(written?.traceId.length).toBe(32)
      expect(yield* theme.value.get).toBe("dark")
    }).pipe(Effect.provide(Theme.layer.pipe(Layer.provideMerge(State.layer)))),
  )

  it.effect(
    "every slot can be shown as it was after any write, and a fork carries on from there",
    () =>
      Effect.gen(function* () {
        const state = yield* State.State
        const theme = yield* Theme
        const scope = yield* Scope.make()
        const size = yield* Scope.provide(state.slot(["size"], Schema.Int, 1), scope)

        yield* theme.set("chosen", "dark")
        yield* size.set("grown", 2)
        yield* theme.set("chosen", "light")

        yield* state.travelTo(1)
        expect([yield* theme.value.get, yield* size.value.get, yield* state.viewing.get]).toEqual([
          "dark",
          1,
          1,
        ])

        yield* state.travelTo(null)
        expect([yield* theme.value.get, yield* size.value.get]).toEqual(["light", 2])

        yield* state.travelTo(2)
        yield* state.fork
        expect([yield* theme.value.get, yield* size.value.get]).toEqual(["dark", 2])
        expect((yield* state.log.get).map((entry) => entry.seq)).toEqual([1, 2])

        yield* state.fork
        yield* state.travelTo(1)
        yield* size.set("grown", 5)
        expect([yield* state.viewing.get, yield* theme.value.get, yield* size.value.get]).toEqual([
          null,
          "dark",
          5,
        ])
      }).pipe(Effect.provide(Theme.layer.pipe(Layer.provideMerge(State.layer)))),
  )
})

class Theme extends State.Tag<Theme>()("app/Theme", Schema.Literals(["light", "dark"]), "light") {}
