import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Schema, Stream } from "effect"
import { State as OneState, Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite, notes: Schema.Array(Schema.String) })

type State = typeof State.Type

const initialState: State = { count: 0, notes: [] }

class Ledger extends Store.Tag<Ledger>()("test/Ledger", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      ...state,
      count: state.count + by,
    })),
    noted: Store.action(Schema.Struct({ text: Schema.String }), (state: State, { text }) => ({
      ...state,
      notes: [...state.notes, text],
    })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    notes: Store.selector(Schema.Array(Schema.String), (state: State) => state.notes),
  },
}) {}

const layer = Ledger.layer.pipe(Layer.provideMerge(OneState.layer))

describe("Store", () => {
  it("a log read back from text refuses an entry missing its action, payload or place", () => {
    const read = Schema.decodeUnknownExit(Store.LogText)

    expect(
      [
        '[{"id":"a","action":"added","payload":{"by":1},"seq":1}]',
        '[{"id":"a"}]',
        '[{"id":"a","action":"added","payload":{"by":1}}]',
      ].map((text) => Exit.isSuccess(read(text))),
    ).toEqual([true, false, false])
  })

  it.effect("a command changes the state its selectors show", () =>
    Effect.gen(function* () {
      const ledger = yield* Ledger

      yield* ledger.commands.incremented({ by: 2 })
      yield* ledger.commands.incremented({ by: 3 })

      expect(yield* ledger.select.count.get).toBe(5)
    }).pipe(Effect.provide(layer)),
  )

  it.effect("a selector emits only when its own value changes", () =>
    Effect.gen(function* () {
      const ledger = yield* Ledger
      const counts = yield* Stream.runCollect(Stream.take(ledger.select.count.changes, 2)).pipe(
        Effect.forkChild({ startImmediately: true }),
      )

      yield* ledger.commands.noted({ text: "unrelated" })
      yield* ledger.commands.noted({ text: "also unrelated" })
      yield* ledger.commands.incremented({ by: 1 })

      expect(yield* Fiber.join(counts)).toEqual([0, 1])
    }).pipe(Effect.provide(layer)),
  )
})
