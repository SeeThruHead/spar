import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { TestClock } from "effect/testing"
import { Outbox, Store } from "spar"

const State = Schema.Struct({
  total: Schema.Finite,
  notes: Schema.Array(Schema.String),
})

type State = typeof State.Type

const initialState: State = { total: 0, notes: [] }

class Journal extends Store.Tag<Journal>()("test/Journal", {
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ amount: Schema.Finite }), (state: State, { amount }) => ({
      ...state,
      total: state.total + amount,
    })),
    noted: Store.action(Schema.Struct({ text: Schema.String }), (state: State, { text }) => ({
      ...state,
      notes: [...state.notes, text],
    })),
  },
  selectors: { total: (state) => state.total },
}) {}

const Amount = Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))

const session = Effect.fnUntraced(function* <A, E>(
  use: (journal: Context.Service.Shape<typeof Journal>) => Effect.Effect<A, E>,
) {
  const stored = yield* KeyValueStore.KeyValueStore

  return yield* Journal.use(use).pipe(
    Effect.provide(
      Journal.layerDurable({ state: State, compactAfter: 3 }).pipe(
        Layer.provide(SecureRandom.layerWebCrypto),
        Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, stored)),
      ),
    ),
  )
})

const savedKeys = Effect.gen(function* () {
  const stored = yield* KeyValueStore.KeyValueStore
  const keys = yield* stored.keys

  return keys.filter((key) => key.startsWith("spar/store/test/Journal/")).toSorted()
})

describe("a store kept on the device", () => {
  it.effect("comes back after a restart with the state it had", () =>
    Effect.gen(function* () {
      yield* session((journal) =>
        Effect.andThen(
          journal.commands.added({ amount: 5 }),
          journal.commands.noted({ text: "first" }),
        ),
      )

      const restored = yield* session((journal) => journal.state.get)

      expect(restored).toEqual({ total: 5, notes: ["first"] })
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("folds old entries into one saved state and still restores exactly", () =>
    Effect.gen(function* () {
      yield* session((journal) =>
        Effect.forEach([1, 2, 3, 4, 5], (amount) => journal.commands.added({ amount }), {
          discard: true,
        }),
      )

      const restored = yield* session((journal) =>
        Effect.all({ state: journal.state.get, log: journal.log.get }),
      )

      expect(yield* savedKeys).toEqual([
        "spar/store/test/Journal/head",
        "spar/store/test/Journal/log/000000000004",
        "spar/store/test/Journal/log/000000000005",
        "spar/store/test/Journal/snapshot",
      ])
      expect(restored.state.total).toBe(15)
      expect(restored.log.map((entry) => entry.seq)).toEqual([4, 5])

      const continued = yield* session((journal) =>
        Effect.andThen(journal.commands.added({ amount: 6 }), journal.log.get),
      )

      expect(continued.at(-1)?.seq).toBe(6)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect.prop(
    "any run of commands restores to the same state after a restart",
    [Schema.Array(Amount)],
    ([amounts]) =>
      Effect.gen(function* () {
        const live = yield* session((journal) =>
          Effect.andThen(
            Effect.forEach(amounts, (amount) => journal.commands.added({ amount }), {
              discard: true,
            }),
            journal.state.get,
          ),
        )
        const restored = yield* session((journal) => journal.state.get)

        expect(restored).toEqual(live)
        expect(live.total).toBe(amounts.reduce((sum, amount) => sum + amount, 0))
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("saved data that no longer fits fails to start and says which store", () =>
    Effect.gen(function* () {
      const stored = yield* KeyValueStore.KeyValueStore

      yield* stored.set(
        "spar/store/test/Journal/snapshot",
        JSON.stringify({ seq: 2, state: { total: "plenty" } }),
      )

      const error = yield* Effect.flip(session((journal) => journal.state.get))

      expect(error._tag).toBe("Unreadable")
      expect(error.message).toContain("test/Journal")
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect(
    "an action that was queued to send but not yet logged is applied on the next start",
    () =>
      Effect.gen(function* () {
        const stored = yield* KeyValueStore.KeyValueStore
        const sent = yield* Ref.make<ReadonlyArray<string>>([])
        const withOutbox = Journal.layerDurable({ state: State }, [
          Store.outbox(Journal.actions.noted, ({ text }) =>
            Ref.update(sent, (all) => [...all, text]),
          ),
        ]).pipe(
          Layer.provideMerge(Outbox.Outbox.layer),
          Layer.provide(SecureRandom.layerWebCrypto),
          Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, stored)),
        )

        yield* Effect.gen(function* () {
          const journal = yield* Journal

          yield* journal.commands.noted({ text: "logged and sent" })
          yield* TestClock.adjust("1 second")
        }).pipe(Effect.provide(withOutbox))
        yield* stored.set(
          "spar/outbox/crashed-before-the-log",
          JSON.stringify({
            channel: "test/Journal/noted",
            payload: { text: "typed just before a crash" },
            seq: 2,
          }),
        )
        yield* stored.set(
          "spar/outbox/and-one-more",
          JSON.stringify({
            channel: "test/Journal/noted",
            payload: { text: "and one more" },
            seq: 3,
          }),
        )

        const restored = yield* Effect.gen(function* () {
          const journal = yield* Journal

          yield* TestClock.adjust("1 second")

          return yield* journal.state.get
        }).pipe(Effect.provide(withOutbox))

        const expected = ["logged and sent", "typed just before a crash", "and one more"]

        expect(restored.notes).toEqual(expected)
        expect(yield* Ref.get(sent)).toEqual(expected)
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
})
