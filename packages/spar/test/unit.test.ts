import { describe, expect, it } from "@effect/vitest"
import { Effect, Ref, Schema } from "effect"
import { Store, View, compose, withProps } from "spar"
import * as Trees from "../src/internal/uiTrees.ts"
import * as Testing from "spar/testing"
import { PairView, TallyView } from "./units.tsx"

class TallyStore extends Store.Tag<TallyStore>()("test/Tally", {
  state: Schema.Finite,
  initialState: 0,
  actions: {
    added: Store.action(Schema.Finite, (count: number, by) => count + by),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (count: number) => count),
  },
}) {}

const Tally = TallyStore.with(
  compose(
    withProps({ label: Schema.String }),
    Effect.fnUntraced(function* ({ label }) {
      const store = yield* TallyStore

      return { label, count: store.select.count, onAdd: store.commands.added(1) }
    }),
  )(TallyView),
)

const Lone = TallyStore.with(
  compose(
    Effect.fnUntraced(function* () {
      const store = yield* TallyStore

      return { label: "plums", count: store.select.count, onAdd: store.commands.added(1) }
    }),
  )(TallyView),
)

const Pair = compose(
  Effect.fnUntraced(function* () {
    return {
      first: yield* View.child(Tally, { label: "apples" }),
      second: yield* View.child(Tally, { label: "pears" }),
    }
  }),
)(PairView)

const registering = (seen: Ref.Ref<ReadonlyArray<string>>) => ({
  keepStates: 0,
  register: (store: Store.Inspected) => Ref.update(seen, (keys) => [...keys, store.key]),
})

describe("a store declared beside its view", () => {
  it.live("needs no layer at the root, and each place it is used has its own state", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const tree = Trees.makeTree()

      yield* Testing.mount(Pair).pipe(
        Effect.provideService(Store.Inspector, registering(seen)),
        Effect.provideService(Trees.Tree, tree),
      )
      yield* Testing.click("button", "Add to pears")
      yield* Testing.click("button", "Add to pears")
      yield* Testing.click("button", "Add to apples")

      expect((yield* Testing.find("status", "pears count")).textContent).toBe("2")
      expect((yield* Testing.find("status", "apples count")).textContent).toBe("1")
      expect(yield* Ref.get(seen)).toEqual([
        "test/Tally @ Pair / Tally",
        "test/Tally @ Pair / Tally#2",
      ])
    }),
  )

  it.live("gives its place back when it is unmounted", () =>
    Effect.gen(function* () {
      const tree = Trees.makeTree()

      yield* Effect.scoped(Testing.mount(Pair).pipe(Effect.provideService(Trees.Tree, tree)))

      expect([...tree.taken]).toEqual([])
    }),
  )

  it.live("is named by its own view when it is the whole page", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])

      yield* Testing.mount(Lone).pipe(Effect.provideService(Store.Inspector, registering(seen)))
      yield* Testing.click("button", "Add to plums")

      expect((yield* Testing.find("status", "plums count")).textContent).toBe("1")
      expect(yield* Ref.get(seen)).toEqual(["test/Tally @ Tally"])
    }),
  )
})
