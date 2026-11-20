import { describe, expect, it } from "@effect/vitest"
import {
  Context,
  Effect,
  Exit,
  FiberHandle,
  Layer,
  PubSub,
  Schedule,
  Schema,
  Scope,
  Stream,
} from "effect"
import { KeyValueStore } from "effect/persistence"
import { Reactive, Tabs, UiState, compose, withUiState } from "spar"
import * as Testing from "spar/testing"
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
      const state = yield* State.current
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

class Theme extends State.Tag<Theme>()("app/Theme", Schema.Literals(["light", "dark"]), "light") {}

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") })

const LocalCounter = compose(withUiState("count", Schema.Int, 0))((props) => (
  <button onClick={UiState.update(props.count, (count) => count + 1)}>
    Clicked {props.count} times
  </button>
))

const slots = (snapshot: State.Snapshot) =>
  snapshot.map((entry) => [...entry.path, entry.name].join(" / "))

describe("one state for everything", () => {
  it.live("a store is a service over a slot; a second reset while one runs is ignored", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      const state = yield* State.current

      yield* counter.increment
      yield* counter.increment
      yield* counter.reset
      yield* counter.reset
      expect(yield* counter.resetting.get).toBe(true)

      yield* until(counter.resetting.get, (resetting) => !resetting)
      expect(yield* counter.count.get).toBe(0)
      expect((yield* state.log.get).map((entry) => [entry.slot, entry.name])).toEqual([
        ["Counter", "incremented"],
        ["Counter", "incremented"],
        ["Counter", "resetClicked"],
        ["Counter", "resetCompleted"],
      ])
    }).pipe(Effect.provide(Counter.layer.pipe(Layer.provideMerge(State.layer)))),
  )

  it.live("a component's own state is a slot at its path in the same log, gone when it is", () =>
    Effect.gen(function* () {
      const state = yield* State.current
      const scope = yield* Scope.make()

      yield* Scope.provide(Testing.mount(LocalCounter), scope)
      yield* Testing.click("button", "Clicked 0 times")
      yield* Testing.findText("Clicked 1 times")

      const [written] = yield* state.log.get

      expect([written?.path, written?.slot, written?.name, written?.seq]).toEqual([
        ["LocalCounter"],
        "count",
        "set",
        1,
      ])
      expect(slots(yield* state.snapshot)).toEqual(["LocalCounter / count"])

      yield* Scope.close(scope, Exit.void)
      expect(yield* state.snapshot).toEqual([])
    }).pipe(Effect.provide(State.layer)),
  )

  it.effect("a second slot asked for under a key in use gets its own, numbered key", () =>
    Effect.gen(function* () {
      const state = yield* State.current
      const scope = yield* Scope.make()
      const one = yield* Scope.provide(state.slot(["shared"], Schema.String, "a"), scope)
      const two = yield* Scope.provide(state.slot(["shared"], Schema.String, "z"), scope)

      yield* one.set("changed", "b")
      expect([yield* one.value.get, yield* two.value.get]).toEqual(["b", "z"])
      expect(slots(yield* state.snapshot)).toEqual(["shared", "shared#2"])

      yield* Scope.close(scope, Exit.void)
      expect(yield* state.snapshot).toEqual([])
    }).pipe(Effect.provide(State.layer)),
  )

  it.live("saving is a layer around whatever should be saved: the count survives a restart", () =>
    Effect.gen(function* () {
      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const started = Counter.layer.pipe(
        Layer.provide(State.saved),
        Layer.provide(Layer.succeedContext(storage)),
        Layer.provideMerge(State.layer),
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

  it.live("a saved slot follows what another tab saves", () =>
    Effect.gen(function* () {
      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const told = yield* PubSub.unbounded<string>()
      const shared: Tabs.Tabs = {
        exclusively: (_name, effect) => effect,
        stay: () => Effect.void,
        here: () => Effect.succeed(true),
        announce: (name) => Effect.asVoid(PubSub.publish(told, name)),
        announced: (name) =>
          Stream.fromPubSub(told).pipe(
            Stream.filter((heard) => heard === name),
            Stream.map(() => undefined),
          ),
      }
      const tab = Counter.layer.pipe(
        Layer.provide(State.saved),
        Layer.provide(Layer.succeedContext(storage)),
        Layer.provide(State.layer),
        Layer.provide(Layer.succeed(Tabs.Tabs, shared)),
      )
      const here = yield* Layer.build(tab)
      const there = yield* Layer.build(tab)

      yield* Effect.flatMap(Counter, (counter) => counter.increment).pipe(
        Effect.provideContext(there),
      )

      const count = yield* Effect.flatMap(Counter, (counter) => counter.count.get).pipe(
        Effect.provideContext(here),
        Effect.repeat({ until: (now) => now === 1, schedule: Schedule.spaced("5 millis") }),
        Effect.timeout("1 second"),
      )

      expect(count).toBe(1)
    }),
  )

  it.effect("a slot defined once is used by its value, and each write carries its trace", () =>
    Effect.gen(function* () {
      const state = yield* State.current
      const theme = yield* Theme

      yield* Effect.withSpan(theme.set("chosen", "dark"), "choose theme")

      const [written] = yield* state.log.get

      expect([written?.slot, written?.name, written?.seq]).toEqual(["app/Theme", "chosen", 1])
      expect(written?.traceId.length).toBe(32)
      expect(yield* theme.value.get).toBe("dark")
    }).pipe(Effect.provide(Theme.layer.pipe(Layer.provideMerge(State.layer)))),
  )

  it.effect(
    "every slot can be shown as it was after any write, and a fork carries on from there",
    () =>
      Effect.gen(function* () {
        const state = yield* State.current
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

  it.effect(
    "a slot keeps a bounded past: moments in the log show right, older ones its oldest",
    () =>
      Effect.gen(function* () {
        const state = yield* State.current
        const count = yield* state.slot(["count"], Schema.Int, 0)

        yield* Effect.forEach(
          Array.from({ length: 2500 }, (_, index) => index + 1),
          (next) => count.set("counted", next),
        )

        const seqs = (yield* state.log.get).map((entry) => entry.seq)

        expect([seqs.length, seqs[0]]).toEqual([1000, 1501])

        yield* state.travelTo(1501)
        expect(yield* count.value.get).toBe(1501)
        yield* state.travelTo(1)
        expect(yield* count.value.get).toBe(1001)
        yield* state.travelTo(null)
        expect(yield* count.value.get).toBe(2500)
      }).pipe(Effect.scoped, Effect.provide(State.layer)),
  )
})
