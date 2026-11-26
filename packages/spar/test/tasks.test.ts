import { describe, expect, it } from "@effect/vitest"
import { Context, Duration, Effect, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { State as OneState, Store, Timeline } from "spar"

const State = Schema.Struct({ count: Schema.Finite, delay: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0, delay: 2 }

const counting = {
  incremented: Store.action(Schema.Void, (state: State): State => ({
    ...state,
    count: state.count + 1,
  })),
}

const selectors = { count: Store.selector(Schema.Finite, (state: State) => state.count) }

const reset = (mode: Store.Mode, refuses: ReadonlyArray<"incremented" | "reset">) =>
  Store.task(Schema.Void, {
    result: Schema.Void,
    run: (_: void, state: State) => Effect.sleep(Duration.seconds(state.delay)),
    finish: (state: State): State => ({ ...state, count: 0 }),
    mode,
    refuses,
  })

class Held extends Store.Tag<Held>()("test/Held", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: { reset: reset("switch", ["incremented", "reset"]) },
}) {}

class Restarted extends Store.Tag<Restarted>()("test/Restarted", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: { reset: reset("switch", []) },
}) {}

const added = (mode: Store.Mode) =>
  Store.task(Schema.Finite, {
    result: Schema.Finite,
    run: (by: number) => Effect.as(Effect.sleep(Duration.seconds(1)), by),
    finish: (state: State, by: number): State => ({ ...state, count: state.count + by }),
    mode,
  })

class Queued extends Store.Tag<Queued>()("test/Queued", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: { add: added("queue") },
}) {}

class Together extends Store.Tag<Together>()("test/Together", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: { add: added("concurrent") },
}) {}

class Overlapping extends Store.Tag<Overlapping>()("test/Overlapping", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: {
    add: Store.task(Schema.Finite, {
      result: Schema.Finite,
      run: (by: number) => Effect.as(Effect.sleep(Duration.seconds(1)), by),
      finish: (state: State, by: number): State => ({ ...state, count: state.count + by }),
      mode: "concurrent",
      refuses: ["incremented"],
    }),
  },
}) {}

class Pricing extends Context.Service<
  Pricing,
  { readonly priceOf: (count: number) => Effect.Effect<number> }
>()("test/Pricing") {}

class Priced extends Store.Tag<Priced>()("test/Priced", {
  state: State,
  initialState,
  actions: counting,
  selectors,
  tasks: {
    priced: Store.task(Schema.Void, {
      result: Schema.Finite,
      run: (_: void, state: State) =>
        Effect.flatMap(Pricing, (pricing) => pricing.priceOf(state.count)),
      finish: (state: State, price: number): State => ({ ...state, count: price }),
      mode: "switch",
    }),
  },
}) {}

const pricing = Layer.succeed(Pricing, { priceOf: (count) => Effect.succeed(count * 100 + 7) })

const recorded = Effect.gen(function* () {
  const notes = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])

  return {
    notes,
    recorder: Option.some((noted: Timeline.Noted) => Ref.update(notes, (all) => [...all, noted])),
  }
})

const kinds = (notes: Ref.Ref<ReadonlyArray<Timeline.Noted>>, kind: Timeline.Kind) =>
  Effect.map(Ref.get(notes), (all) =>
    all.filter((noted) => noted.kind === kind).map((noted) => noted.name),
  )

const watched = <A, E, R>(
  test: (notes: Ref.Ref<ReadonlyArray<Timeline.Noted>>) => Effect.Effect<A, E, R>,
) =>
  Effect.flatMap(recorded, ({ notes, recorder }) =>
    Effect.provideService(test(notes), Timeline.Recorder, recorder),
  )

describe("a store's task", () => {
  it.effect(
    "refuses what it names while it runs, itself included, and ends by changing the state",
    () =>
      watched((notes) =>
        Effect.gen(function* () {
          const counter = yield* Held

          yield* counter.commands.incremented()
          yield* counter.tasks.reset()

          expect(yield* counter.running.reset.get).toBe(true)

          yield* counter.commands.incremented()
          yield* counter.tasks.reset()

          expect(yield* counter.select.count.get).toBe(1)

          yield* TestClock.adjust(Duration.seconds(2))

          expect(yield* counter.select.count.get).toBe(0)
          expect(yield* counter.running.reset.get).toBe(false)

          yield* counter.commands.incremented()

          expect(yield* counter.select.count.get).toBe(1)
          expect(yield* kinds(notes, "command")).toEqual([
            "test/Held/incremented",
            "test/Held/reset",
            "test/Held/reset finished",
            "test/Held/incremented",
          ])
          expect(
            (yield* Ref.get(notes))
              .filter((noted) => noted.kind === "refused")
              .map((noted) => [noted.name, noted.detail]),
          ).toEqual([
            ["test/Held/incremented", { while: ["reset"] }],
            ["test/Held/reset", { while: ["reset"] }],
          ])
        }).pipe(Effect.provide(Held.layer.pipe(Layer.provideMerge(OneState.layer)))),
      ),
  )

  it.effect(
    "notices the third refusal while one run holds, once, and counts again from the next run",
    () =>
      watched((notes) =>
        Effect.gen(function* () {
          const counter = yield* Held
          const noticedSoFar = Effect.map(Ref.get(notes), (all) =>
            all
              .filter((noted) => noted.kind === "noticed")
              .map((noted) => ({ name: noted.name, detail: noted.detail })),
          )
          const refusedTimes = (times: number) =>
            Effect.forEach(Array.from({ length: times }), () => counter.commands.incremented(), {
              discard: true,
            })

          yield* counter.tasks.reset()
          yield* refusedTimes(2)

          expect(yield* noticedSoFar).toEqual([])

          yield* counter.tasks.reset()
          yield* refusedTimes(2)
          yield* TestClock.adjust(Duration.seconds(2))
          yield* counter.tasks.reset()
          yield* refusedTimes(2)

          const first = {
            name: "test/Held/reset",
            detail: {
              code: "SPAR_REFUSALS_PILED_UP",
              said: "reset was refused 3 times while reset ran.",
            },
          }

          expect(yield* noticedSoFar).toMatchObject([first])

          yield* refusedTimes(1)

          expect(yield* noticedSoFar).toMatchObject([
            first,
            {
              name: "test/Held/reset",
              detail: {
                code: "SPAR_REFUSALS_PILED_UP",
                said: "incremented was refused 3 times while reset ran.",
              },
            },
          ])
        }).pipe(Effect.provide(Held.layer.pipe(Layer.provideMerge(OneState.layer)))),
      ),
  )

  it.effect("keeps counting refusals while overlapping runs hold, until the last one ends", () =>
    watched((notes) =>
      Effect.gen(function* () {
        const adder = yield* Overlapping
        const refusedOnce = adder.commands.incremented()

        yield* adder.tasks.add(1)
        yield* refusedOnce
        yield* refusedOnce
        yield* TestClock.adjust(Duration.millis(500))
        yield* adder.tasks.add(1)
        yield* TestClock.adjust(Duration.millis(500))

        expect(yield* adder.select.count.get).toBe(1)

        yield* refusedOnce

        expect(yield* kinds(notes, "noticed")).toEqual(["test/Overlapping/add"])
      }).pipe(Effect.provide(Overlapping.layer.pipe(Layer.provideMerge(OneState.layer)))),
    ),
  )

  it.effect("in switch mode a second start replaces the first, which never finishes", () =>
    watched((notes) =>
      Effect.gen(function* () {
        const counter = yield* Restarted

        yield* counter.commands.incremented()
        yield* counter.tasks.reset()
        yield* TestClock.adjust(Duration.seconds(1))
        yield* counter.tasks.reset()
        yield* TestClock.adjust(Duration.seconds(1))

        expect(yield* counter.select.count.get).toBe(1)
        expect(yield* counter.running.reset.get).toBe(true)

        yield* TestClock.adjust(Duration.seconds(1))

        expect(yield* counter.select.count.get).toBe(0)
        expect(yield* counter.running.reset.get).toBe(false)
        expect(yield* kinds(notes, "command")).toEqual([
          "test/Restarted/incremented",
          "test/Restarted/reset",
          "test/Restarted/reset",
          "test/Restarted/reset finished",
        ])
      }).pipe(Effect.provide(Restarted.layer.pipe(Layer.provideMerge(OneState.layer)))),
    ),
  )

  it.effect("in queue mode each start waits for the one before it", () =>
    Effect.gen(function* () {
      const counter = yield* Queued

      yield* counter.tasks.add(1)
      yield* counter.tasks.add(10)
      yield* TestClock.adjust(Duration.seconds(1))

      expect(yield* counter.select.count.get).toBe(1)
      expect(yield* counter.running.add.get).toBe(true)

      yield* TestClock.adjust(Duration.seconds(1))

      expect(yield* counter.select.count.get).toBe(11)
      expect(yield* counter.running.add.get).toBe(false)
    }).pipe(Effect.provide(Queued.layer.pipe(Layer.provideMerge(OneState.layer)))),
  )

  it.effect("in concurrent mode every start runs at once", () =>
    Effect.gen(function* () {
      const counter = yield* Together

      yield* counter.tasks.add(1)
      yield* counter.tasks.add(10)
      yield* TestClock.adjust(Duration.seconds(1))

      expect(yield* counter.select.count.get).toBe(11)
      expect(yield* counter.running.add.get).toBe(false)
    }).pipe(Effect.provide(Together.layer.pipe(Layer.provideMerge(OneState.layer)))),
  )

  it.effect("a task's run can use a service that the store's layer is given", () =>
    Effect.gen(function* () {
      const counter = yield* Priced

      yield* counter.commands.incremented()
      yield* counter.tasks.priced()
      yield* Effect.yieldNow

      expect(yield* counter.select.count.get).toBe(107)
    }).pipe(
      Effect.provide(Priced.layer.pipe(Layer.provide(pricing), Layer.provideMerge(OneState.layer))),
    ),
  )

  it.effect("a log holding a task's start and finish replays to the same state", () =>
    Effect.gen(function* () {
      const inspected = yield* Ref.make<Option.Option<Store.Inspected>>(Option.none())
      const inspector = {
        keepStates: 0,
        register: (store: Store.Inspected) => Ref.set(inspected, Option.some(store)),
      }

      yield* Effect.gen(function* () {
        const counter = yield* Queued
        const store = Option.getOrThrow(yield* Ref.get(inspected))

        yield* store.load([
          { id: "1", action: "add", payload: 5, seq: 1 },
          { id: "2", action: "add finished", payload: 5, seq: 2 },
          { id: "3", action: "incremented", payload: null, seq: 3 },
        ])

        expect(yield* counter.state.get).toEqual({ count: 6, delay: 2 })
      }).pipe(
        Effect.provide(Queued.layer.pipe(Layer.provideMerge(OneState.layer))),
        Effect.provideService(Store.Inspector, inspector),
      )
    }),
  )
})
