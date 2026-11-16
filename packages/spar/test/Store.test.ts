import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { TestClock } from "effect/testing"
import { Outbox, Store } from "spar"

type State = {
  readonly count: number
  readonly notes: ReadonlyArray<string>
}

const initialState: State = { count: 0, notes: [] }

class Ledger extends Store.Tag<Ledger>()("test/Ledger", {
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
    count: (state) => state.count,
    notes: (state) => state.notes,
  },
}) {}

class Sent extends Context.Service<
  Sent,
  {
    readonly attempts: Ref.Ref<ReadonlyArray<{ readonly text: string; readonly key: string }>>
    readonly seen: Ref.Ref<ReadonlyArray<{ readonly by: number; readonly count: number }>>
  }
>()("test/Sent") {
  static readonly layer = Layer.effect(
    Sent,
    Effect.gen(function* () {
      return Sent.of({
        attempts: yield* Ref.make<ReadonlyArray<{ readonly text: string; readonly key: string }>>(
          [],
        ),
        seen: yield* Ref.make<ReadonlyArray<{ readonly by: number; readonly count: number }>>([]),
      })
    }),
  )
}

class Offline extends Schema.TaggedError<Offline, { readonly brand: unique symbol }>()(
  "Offline",
  {},
) {}

const reactions = [
  Store.after(
    Ledger.actions.incremented,
    Effect.fnUntraced(function* ({ by }, state) {
      const sent = yield* Sent

      yield* Ref.update(sent.seen, (seen) => [...seen, { by, count: state.count }])
    }),
  ),
  Store.outbox(
    Ledger.actions.noted,
    Effect.fnUntraced(function* ({ text }, key) {
      const sent = yield* Sent
      const attempts = yield* Ref.updateAndGet(sent.attempts, (all) => [...all, { text, key }])

      if (attempts.length < 3) return yield* new Offline()
    }),
  ),
]

const base = Layer.mergeAll(Sent.layer, Outbox.Outbox.layer, SecureRandom.layerWebCrypto)

const layer = Ledger.layer(reactions).pipe(
  Layer.provideMerge(base),
  Layer.provideMerge(KeyValueStore.layerMemory),
)

describe("Store", () => {
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

  it.effect("replaying the log rebuilds the same state, and a shorter log an earlier one", () =>
    Effect.gen(function* () {
      const ledger = yield* Ledger

      yield* ledger.commands.incremented({ by: 4 })
      yield* ledger.commands.noted({ text: "first" })
      yield* ledger.commands.incremented({ by: 1 })

      const log = yield* ledger.log.get

      expect(yield* Store.replay(Ledger.definition, log)).toEqual(yield* ledger.state.get)
      expect(yield* Store.replay(Ledger.definition, log.slice(0, 1))).toEqual({
        count: 4,
        notes: [],
      })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("an effect declared after an action runs with its payload and the new state", () =>
    Effect.gen(function* () {
      const ledger = yield* Ledger
      const sent = yield* Sent

      yield* ledger.commands.incremented({ by: 2 })
      yield* ledger.commands.incremented({ by: 5 })
      yield* Effect.yieldNow

      expect(yield* Ref.get(sent.seen)).toEqual([
        { by: 2, count: 2 },
        { by: 5, count: 7 },
      ])
    }).pipe(Effect.provide(layer)),
  )

  it.effect(
    "the outbox keeps an item until it is delivered, retrying with one idempotency key",
    () =>
      Effect.gen(function* () {
        const ledger = yield* Ledger
        const sent = yield* Sent
        const outbox = yield* Outbox.Outbox

        yield* ledger.commands.noted({ text: "hello" })
        yield* Effect.yieldNow

        expect(yield* outbox.pending.get).toBe(1)

        yield* TestClock.adjust("10 seconds")

        const attempts = yield* Ref.get(sent.attempts)

        expect(attempts.map((attempt) => attempt.text)).toEqual(["hello", "hello", "hello"])
        expect(new Set(attempts.map((attempt) => attempt.key)).size).toBe(1)
        expect(yield* outbox.pending.get).toBe(0)
      }).pipe(Effect.provide(layer)),
  )

  it.effect("an item left in the outbox by an earlier session is delivered on start", () =>
    Effect.gen(function* () {
      const stored = yield* KeyValueStore.KeyValueStore

      yield* stored.set(
        "spar/outbox/left-over",
        JSON.stringify({ channel: "test/Ledger/noted", payload: { text: "from before" } }),
      )

      const attempts = yield* Effect.gen(function* () {
        const sent = yield* Sent

        yield* Ledger
        yield* TestClock.adjust("10 seconds")

        return yield* Ref.get(sent.attempts)
      }).pipe(Effect.provide(Ledger.layer(reactions).pipe(Layer.provideMerge(base))))

      expect(attempts.at(-1)).toEqual({ text: "from before", key: "left-over" })
      expect(yield* stored.has("spar/outbox/left-over")).toBe(false)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
})
