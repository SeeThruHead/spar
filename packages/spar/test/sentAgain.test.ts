import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Ref, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"
import { Outbox, Store, Timeline } from "spar"

const State = Schema.Struct({ orders: Schema.Int })

type State = typeof State.Type

const placed = (state: State): State => ({ orders: state.orders + 1 })

class Till extends Store.Tag<Till>()("test/Till", {
  state: State,
  initialState: { orders: 0 },
  actions: {
    paid: Store.action(Schema.Struct({ order: Schema.String }), placed),
    posted: Store.action(Schema.Struct({ order: Schema.String }), placed),
    counted: Store.action(Schema.Void, placed),
  },
  selectors: {},
}) {}

class Bank extends Context.Service<Bank, Deferred.Deferred<void>>()("test/Bank") {
  static readonly layer = Layer.effect(Bank, Deferred.make<void>())
}

const answered = Effect.flatMap(Effect.service(Bank), (open) => Deferred.await(open))

const noticedIn = Effect.gen(function* () {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    Till.layer([
      Store.after(Till.actions.paid, () => answered),
      Store.outbox(Till.actions.posted, () => answered),
    ]).pipe(
      Layer.provideMerge(Layer.merge(Bank.layer, Outbox.Outbox.layer)),
      Layer.provideMerge(KeyValueStore.layerMemory),
      Layer.provideMerge(
        Layer.succeed(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      ),
    ),
  )

  return {
    till: Context.get(built, Till),
    bank: Context.get(built, Bank),
    notices: Effect.map(Ref.get(noted), (all) =>
      all.filter((seen) => seen.kind === "noticed").map((seen) => [seen.name, seen.detail]),
    ),
  }
})

describe("the same command sent twice", () => {
  it.effect("is reported while what the first one started is still running, and not after", () =>
    Effect.gen(function* () {
      const { till, bank, notices } = yield* noticedIn

      yield* till.commands.paid({ order: "a" })
      yield* till.commands.paid({ order: "b" })
      yield* till.commands.counted()
      yield* till.commands.counted()
      expect(yield* notices).toEqual([])

      yield* till.commands.paid({ order: "a" })
      expect(yield* notices).toEqual([
        [
          "test/Till/paid",
          {
            code: "SPAR_SENT_AGAIN",
            said: "test/Till/paid was sent again with the same payload while what the first one started was still running.",
            in: "",
            at: "",
          },
        ],
      ])

      yield* Deferred.succeed(bank, undefined)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* till.commands.paid({ order: "a" })
      expect((yield* notices).length).toBe(1)
    }),
  )

  it.effect("is reported while the first is still waiting in the outbox", () =>
    Effect.gen(function* () {
      const { till, notices } = yield* noticedIn

      yield* till.commands.posted({ order: "a" })
      yield* till.commands.posted({ order: "b" })
      expect(yield* notices).toEqual([])

      yield* till.commands.posted({ order: "a" })
      expect((yield* notices).map(([name]) => name)).toEqual(["test/Till/posted"])
    }),
  )
})
