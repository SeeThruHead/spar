import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, FiberHandle, Layer, Option, Schedule, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"
import { Store, compose } from "spar"
import * as Devtools from "spar/devtools"
import * as Testing from "spar/testing"
import * as State from "../src/State.ts"
import * as Cell from "../src/internal/cell.ts"
import { Tree, UiTree } from "../src/internal/uiTree.ts"

const keepingLayer = Layer.sync(UiTree, () => {
  const tree = new Tree()

  tree.keepAtLeast(1000)

  return tree
})

const lastInspected = Cell.make<Option.Option<Store.Inspected>>(Option.none())

const capturing = {
  keepStates: 1000,
  register: (store: Store.Inspected) => Effect.sync(() => lastInspected.write(Option.some(store))),
}

const inspectedStore = Effect.orDie(
  Effect.flatMap(
    Effect.sync(() => lastInspected.read()),
    (found) => Effect.fromNullishOr(Option.getOrUndefined(found)),
  ),
)

const inspectedLog = Effect.flatMap(inspectedStore, (store) => store.log.get)

const Counting = Schema.Struct({ count: Schema.Int, resetting: Schema.Boolean })

type Counting = typeof Counting.Type

class CounterModel extends Store.Tag<CounterModel>()("test/CounterModel", {
  state: Counting,
  initialState: { count: 0, resetting: false },
  actions: {
    incremented: Store.action(Schema.Void, (now: Counting): Counting => ({
      ...now,
      count: now.count + 1,
    })),
    added: Store.action(Schema.Int, (now: Counting, by): Counting => ({
      ...now,
      count: now.count + by,
    })),
    resetClicked: Store.action(Schema.Void, (now: Counting): Counting => ({
      ...now,
      resetting: true,
    })),
    resetCompleted: Store.action(Schema.Void, (): Counting => ({ count: 0, resetting: false })),
  },
  selectors: {
    count: Store.selector(Schema.Int, (now: Counting) => now.count),
    resetting: Store.selector(Schema.Boolean, (now: Counting) => now.resetting),
  },
}) {}

class NamedCounter extends Store.Tag<NamedCounter>()("test/NamedCounter", {
  state: Counting,
  initialState: { count: 0, resetting: false },
  actions: CounterModel.actions,
  selectors: { count: Store.selector(Schema.Int, (now: Counting) => now.count) },
  savedAs: "counter.v2",
}) {}

class Resets extends Context.Service<Resets, { readonly reset: Effect.Effect<void> }>()(
  "test/Resets",
) {
  static readonly layer = Layer.effect(
    Resets,
    Effect.gen(function* () {
      const counter = yield* CounterModel
      const running = yield* FiberHandle.make()

      return {
        reset: Effect.asVoid(
          FiberHandle.run(
            running,
            Effect.andThen(
              counter.commands.resetClicked(),
              Effect.andThen(Effect.sleep("30 millis"), counter.commands.resetCompleted()),
            ),
            { onlyIfMissing: true },
          ),
        ),
      }
    }),
  )
}

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") })

const counting = Resets.layer.pipe(
  Layer.provideMerge(CounterModel.layer),
  Layer.provideMerge(keepingLayer),
)

describe("a store on one state", () => {
  it.live("is a slot with named updates; what takes time is a method on a service", () =>
    Effect.gen(function* () {
      const counter = yield* CounterModel
      const resets = yield* Resets
      const state = yield* State.current

      yield* counter.commands.incremented()
      yield* counter.commands.added(4)
      expect(yield* counter.select.count.get).toBe(5)

      yield* resets.reset
      yield* resets.reset
      yield* until(counter.select.resetting.get, (resetting) => !resetting)
      expect(yield* counter.select.count.get).toBe(0)
      expect((yield* state.log.get).map((entry) => [entry.name, entry.payload ?? null])).toEqual([
        ["incremented", null],
        ["added", 4],
        ["resetClicked", null],
        ["resetCompleted", null],
      ])
    }).pipe(Effect.provide(counting)),
  )

  it.live("is seen by the devtools: its log with payloads, running and loading actions", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry
      const counter = yield* CounterModel

      yield* counter.commands.incremented()
      yield* counter.commands.added(2)

      const [inspected] = yield* registry.stores.get

      expect(inspected?.key).toBe("test/CounterModel")
      expect(
        (yield* inspected?.log.get ?? Effect.succeed([])).map((entry) => entry.payload),
      ).toEqual([null, 2])
      yield* inspected?.run("added", 3) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(6)
      yield* inspected?.travelTo(1) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(1)
      expect(yield* inspected?.viewing.get ?? Effect.succeed(null)).toBe(1)
      yield* inspected?.travelTo(null) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(6)
      expect(yield* inspected?.viewing.get ?? Effect.succeed(0)).toBe(null)
      yield* inspected?.load([{ id: "x", action: "added", payload: 7, seq: 1 }]) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(7)
      expect(yield* inspected?.encoded ?? Effect.succeed(null)).toEqual({
        count: 7,
        resetting: false,
      })
      yield* inspected?.travelTo(0) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(0)
      yield* inspected?.travelTo(null) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(6)
      yield* inspected?.forkAt(2) ?? Effect.void
      expect(yield* counter.select.count.get).toBe(3)
      expect(inspected?.actions().map((action) => action.name)).toEqual([
        "incremented",
        "added",
        "resetClicked",
        "resetCompleted",
      ])
      expect(yield* inspected?.hold ?? Effect.succeed(Effect.void)).toBeDefined()
    }).pipe(
      Effect.provide(
        CounterModel.layer.pipe(
          Layer.provideMerge(Devtools.layer),
          Layer.provideMerge(keepingLayer),
        ),
      ),
    ),
  )

  it.live("starts from what a loader gives, or from what was saved", () =>
    Effect.gen(function* () {
      const loaded = yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(CounterModel, (counter) => counter.select.count.get),
          CounterModel.layerFrom(Effect.succeed({ count: 9, resetting: false })).pipe(
            Layer.provideMerge(keepingLayer),
          ),
        ),
      )

      expect(loaded).toBe(9)

      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const saved = CounterModel.layerSaved.pipe(
        Layer.provide(Layer.succeedContext(storage)),
        Layer.provideMerge(keepingLayer),
      )

      yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(CounterModel, (counter) => counter.commands.added(3)),
          saved,
        ),
      )

      const restarted = yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(CounterModel, (counter) => counter.select.count.get),
          saved,
        ),
      )

      expect(restarted).toBe(3)
    }),
  )

  it.live("saves under the key it names, or under its own store key when it names none", () =>
    Effect.gen(function* () {
      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const store = Context.get(storage, KeyValueStore.KeyValueStore)
      const savedIn = <Self,>(layer: Layer.Layer<Self, never, KeyValueStore.KeyValueStore>) =>
        layer.pipe(Layer.provide(Layer.succeedContext(storage)), Layer.provideMerge(keepingLayer))

      yield* store.set("counter.v2", JSON.stringify({ count: 41, resetting: false }))

      const restarted = yield* Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            const counter = yield* NamedCounter

            yield* counter.commands.incremented()

            return yield* counter.select.count.get
          }),
          savedIn(NamedCounter.layerSaved),
        ),
      )

      yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(CounterModel, (counter) => counter.commands.added(2)),
          savedIn(CounterModel.layerSaved),
        ),
      )

      expect(restarted).toBe(42)
      expect(yield* store.get("counter.v2")).toBe(JSON.stringify({ count: 42, resetting: false }))
      expect(yield* store.get("spar/state/test/CounterModel")).toBe(
        JSON.stringify({ count: 2, resetting: false }),
      )
    }),
  )

  it.live("logs what it restored, so its log replays to the same state in a fresh page", () =>
    Effect.gen(function* () {
      const storage = yield* Layer.build(KeyValueStore.layerMemory)
      const saved = CounterModel.layerSaved.pipe(
        Layer.provide(Layer.succeedContext(storage)),
        Layer.provideMerge(keepingLayer),
      )

      yield* Effect.scoped(
        Effect.provide(
          Effect.flatMap(CounterModel, (counter) => counter.commands.added(3)),
          saved,
        ),
      )

      const restored = yield* Effect.scoped(
        Effect.provide(inspectedLog, saved).pipe(Effect.provideService(Store.Inspector, capturing)),
      )
      const replayed = yield* Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            const fresh = yield* inspectedStore

            yield* fresh.load(restored)

            return yield* fresh.stateAt(restored.at(-1)?.seq ?? 0)
          }),
          CounterModel.layer.pipe(Layer.provideMerge(keepingLayer)),
        ).pipe(Effect.provideService(Store.Inspector, capturing)),
      )

      expect(restored.map((entry) => entry.action)).toEqual(["restored from storage"])
      expect(replayed).toEqual({ count: 3, resetting: false })
    }),
  )

  it.live("can sit beside one component, each copy its own", () =>
    Effect.gen(function* () {
      const Count = compose((_props: unknown) =>
        Effect.map(CounterModel, (counter) => ({
          count: counter.select.count,
          onAdd: counter.commands.incremented(),
        })),
      )((props) => <button onClick={props.onAdd}>Count {props.count}</button>)

      yield* Testing.mount(CounterModel.with(Count))
      yield* Testing.click("button", "Count 0")
      yield* Testing.findText("Count 1")
    }).pipe(Effect.provide(keepingLayer)),
  )
})
