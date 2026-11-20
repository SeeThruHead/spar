import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Ref, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Reactive, Router, Store, UiState, compose } from "spar"
import * as Devtools from "spar/devtools"
import * as Testing from "spar/testing"
import { DeskView } from "./timeline.tsx"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

class Tally extends Store.Tag<Tally>()("test/ForkTally", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const next = Router.route("/next")

const Desk = compose(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally
    const router = yield* Router.Router

    return {
      count: tally.select.count,
      draft: yield* UiState.make("draft", Schema.String, ""),
      onAdd: tally.commands.added({ by: 1 }),
      onGo: router.go(next, {}),
    }
  }),
)(DeskView)

const layer = Layer.mergeAll(Tally.layer(), Router.Router.layerMemory("/")).pipe(
  Layer.provideMerge(Devtools.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provideMerge(Layer.sync(UiState.Tree, UiState.makeTree)),
)

const shown = (): ReadonlyArray<string | null> => {
  const draft = screen.getByLabelText("Draft")

  return [
    screen.getByLabelText("Count").textContent,
    draft instanceof HTMLInputElement ? draft.value : null,
  ]
}

const shows = (count: string, draft: string) =>
  Testing.eventually(() => expect(shown()).toEqual([count, draft]))

const recorded = (count: number) =>
  Effect.flatMap(Effect.service(Devtools.Registry), (registry) =>
    Effect.flatMap(registry.branches.get, (all) =>
      (all[0]?.moments ?? 0) >= count ? Effect.void : Effect.fail("still recording"),
    ),
  ).pipe(Effect.retry({ schedule: Schedule.spaced("5 millis"), times: 400 }), Effect.orDie)

const addThree = Effect.gen(function* () {
  yield* Testing.mount(Desk)
  yield* Testing.click("button", "Add")
  yield* Testing.click("button", "Add")
  yield* Testing.click("button", "Add")
  yield* shows("3", "")
  yield* recorded(3)
})

const branches = Effect.flatMap(Effect.service(Devtools.Registry), (registry) =>
  Effect.map(registry.branches.get, (all) =>
    all.map((branch) => [branch.name, branch.from, branch.moments, branch.current]),
  ),
)

const keeping = (keepStates: number, seen: Ref.Ref<ReadonlyArray<Store.Inspected>>) =>
  Layer.provide(
    Tally.layer(),
    Layer.mergeAll(
      SecureRandom.layerWebCrypto,
      Layer.succeed(Store.Inspector, {
        keepStates,
        register: (store) => Ref.update(seen, (all) => [...all, store]),
      }),
    ),
  )

const addedTwice = Effect.fnUntraced(function* (keepStates: number) {
  const seen = yield* Ref.make<ReadonlyArray<Store.Inspected>>([])
  const context = yield* Layer.build(keeping(keepStates, seen))
  const tally = yield* Effect.provide(Effect.service(Tally), context)
  const [inspected] = yield* Ref.get(seen)

  yield* tally.commands.added({ by: 1 })
  yield* tally.commands.added({ by: 1 })

  return { tally, inspected: yield* Effect.fromNullishOr(inspected) }
})

describe("a store asked to fork", () => {
  it.effect("carries on from the state it had then, and can be put back", () =>
    Effect.gen(function* () {
      const { tally, inspected } = yield* addedTwice(10)
      const back = yield* inspected.hold

      expect(inspected.actions().map((action) => action.name)).toEqual(["added"])
      expect(
        JSON.stringify(
          inspected.actions().map((action) => Schema.toJsonSchemaDocument(action.schema)),
        ),
      ).toContain('"by"')

      yield* inspected.forkAt(1)
      expect(yield* tally.select.count.get).toBe(1)
      expect((yield* tally.log.get).map((entry) => entry.seq)).toEqual([1])
      yield* inspected.travelTo(2)
      expect(yield* tally.select.count.get).toBe(1)
      yield* inspected.travelTo(0)
      expect(yield* tally.select.count.get).toBe(0)
      yield* inspected.travelTo(1)
      expect(yield* tally.select.count.get).toBe(1)
      yield* inspected.travelTo(null)
      yield* tally.commands.added({ by: 5 })
      expect(yield* tally.select.count.get).toBe(6)
      yield* back
      expect(yield* tally.select.count.get).toBe(2)
    }),
  )

  it.effect("stays as it is when it no longer has the state it had then", () =>
    Effect.gen(function* () {
      const { tally, inspected } = yield* addedTwice(0)

      yield* inspected.forkAt(1)
      expect(yield* tally.select.count.get).toBe(2)
    }),
  )
})

describe("a branch in the tools", () => {
  it("says how much happened in it and where it left the original", () => {
    expect(
      Devtools.detailOfBranch({ id: 0, name: "Main", from: null, moments: 4, current: true }),
    ).toBe("4 moments")
    expect(
      Devtools.detailOfBranch({ id: 1, name: "Fork 1", from: 2, moments: 3, current: false }),
    ).toBe("3 moments, forked at 2")
  })
})

describe("stepping through what happened", () => {
  it.live("goes back and forward one moment at a time, and off the end is the present", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* addThree
      yield* registry.step(-1)
      expect(yield* registry.viewing.get).toBe(3)
      yield* registry.step(-1)
      yield* shows("2", "")
      yield* registry.step(-1)
      yield* shows("1", "")
      yield* registry.step(-1)
      expect(yield* registry.viewing.get).toBe(1)
      yield* registry.step(1)
      yield* shows("2", "")
      yield* registry.step(1)
      expect(yield* registry.viewing.get).toBe(3)
      yield* registry.step(1)
      expect(yield* registry.viewing.get).toBeNull()
      yield* shows("3", "")
    }).pipe(Effect.provide(layer)),
  )
})

describe("forking the running program", () => {
  it.live("carries on from a past moment, keeps the original, and can go back to it", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* addThree
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* shows("3", "hi")
      yield* registry.travelTo(2)
      yield* shows("2", "")
      yield* registry.fork
      expect(yield* registry.viewing.get).toBeNull()
      expect(yield* branches).toEqual([
        ["Main", null, 4, false],
        ["Fork 1", 2, 2, true],
      ])
      yield* Testing.click("button", "Add")
      yield* shows("3", "")
      expect((yield* registry.moments.get).map((moment) => moment.seq)).toEqual([1, 2, 3])

      yield* registry.switchTo(0)
      yield* shows("3", "hi")
      expect(yield* branches).toEqual([
        ["Main", null, 4, true],
        ["Fork 1", 2, 3, false],
      ])
      yield* Testing.click("button", "Add")
      yield* shows("4", "hi")

      yield* registry.step(-1)
      yield* registry.switchTo(1)
      yield* shows("3", "")
      yield* registry.switchTo(99)
      yield* shows("3", "")
      expect(yield* branches).toEqual([
        ["Main", null, 5, false],
        ["Fork 1", 2, 3, true],
      ])

      yield* registry.fork
      expect(yield* branches).toEqual([
        ["Main", null, 5, false],
        ["Fork 1", 2, 3, false],
        ["Fork 2", 3, 3, true],
      ])
      yield* registry.switchTo(1)
      yield* registry.switchTo(0)
      yield* shows("4", "hi")
      expect(yield* branches).toEqual([
        ["Main", null, 5, true],
        ["Fork 1", 2, 3, false],
        ["Fork 2", 3, 3, false],
      ])
    }).pipe(Effect.provide(layer)),
  )

  it.live("before anything has happened there is nothing to fork", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Testing.mount(Desk)
      yield* registry.fork
      expect(yield* branches).toEqual([["Main", null, 0, true]])
    }).pipe(Effect.provide(layer)),
  )

  it.live("a fork of the present starts from the last moment, for every store there is", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry
      const inspector = yield* Store.Inspector
      const forkedAt = yield* Ref.make<ReadonlyArray<number>>([])

      yield* addThree
      yield* inspector.register({
        key: "test/Late",
        base: 7,
        encoded: Effect.succeed(null),
        state: Reactive.succeed(null),
        log: Reactive.succeed([]),
        viewing: Reactive.succeed(null),
        travelTo: () => Effect.void,
        actions: () => [],
        hold: Effect.succeed(Effect.void),
        forkAt: (seq) => Ref.update(forkedAt, (all) => [...all, seq]),
        load: () => Effect.void,
        run: () => Effect.void,
      })
      yield* registry.fork
      yield* shows("3", "")
      expect(yield* Ref.get(forkedAt)).toEqual([7])
      expect(yield* branches).toEqual([
        ["Main", null, 3, false],
        ["Fork 1", 3, 3, true],
      ])
    }).pipe(Effect.provide(layer)),
  )
})
