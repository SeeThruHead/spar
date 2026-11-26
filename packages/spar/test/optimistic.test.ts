import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Ref, Schedule, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { Outbox, Query, State } from "spar"

class Warehouse extends Context.Service<
  Warehouse,
  {
    readonly stock: Ref.Ref<number>
    readonly asked: Ref.Ref<number>
    readonly open: Deferred.Deferred<void>
  }
>()("test/Warehouse") {
  static readonly layer = Layer.effect(
    Warehouse,
    Effect.all({ stock: Ref.make(3), asked: Ref.make(0), open: Deferred.make<void>() }),
  )
}

class Stock extends Query.Tag<Stock>()("test/optimistic/Stock", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.Never,
  staleAfter: "1 minute",
  load: () =>
    Effect.flatMap(Effect.service(Warehouse), (warehouse) =>
      Effect.andThen(
        Ref.update(warehouse.asked, (count) => count + 1),
        Ref.get(warehouse.stock),
      ),
    ),
}) {}

const restockedOn = "test/optimistic/restocked"

class Restocks extends Context.Service<
  Restocks,
  { readonly restock: (to: number) => Effect.Effect<void> }
>()("test/optimistic/Restocks") {
  static readonly layerWith = (
    send: (to: number) => Effect.Effect<void, string, Warehouse | Stock>,
  ) =>
    Layer.effect(
      Restocks,
      Effect.gen(function* () {
        const stock = yield* Effect.context<Stock>()
        const queued = yield* Outbox.channel(
          restockedOn,
          Schema.Struct({ to: Schema.Finite }),
          ({ to }) => send(to),
        )

        yield* Effect.forkScoped(
          Stream.runForEach(Outbox.givenUp(restockedOn), () =>
            Effect.provideContext(Stock.invalidate, stock),
          ),
          { startImmediately: true },
        )

        return Restocks.of({
          restock: (to) =>
            Effect.andThen(
              Effect.provideContext(
                Stock.patch(undefined, () => to),
                stock,
              ),
              queued({ to }),
            ),
        })
      }),
    )
}

const built = (
  restocks: Layer.Layer<
    Restocks,
    never,
    Warehouse | Stock | Outbox.Outbox | SecureRandom.SecureRandom
  >,
  outbox: Layer.Layer<Outbox.Outbox, never, KeyValueStore.KeyValueStore>,
) =>
  restocks.pipe(
    Layer.provideMerge(Stock.live),
    Layer.provideMerge(Layer.mergeAll(Warehouse.layer, outbox, SecureRandom.layerWebCrypto)),
    Layer.provideMerge(KeyValueStore.layerMemory),
    Layer.provideMerge(State.layer),
  )

const layer = built(
  Restocks.layerWith(
    Effect.fnUntraced(function* (to) {
      const warehouse = yield* Warehouse

      yield* Deferred.await(warehouse.open)
      yield* Ref.set(warehouse.stock, to + 1)
      yield* Stock.invalidate
    }),
  ),
  Outbox.Outbox.layer,
)

const refusing = built(
  Restocks.layerWith(() => Effect.fail("the warehouse refuses")),
  Outbox.Outbox.layerWith({ maxAttempts: 1, attemptTimeout: "1 second" }),
)

const until = <A, E, R>(effect: Effect.Effect<A, E, R>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") })

describe("a change shown at once and sent through the outbox", () => {
  it.live("the query shows the change before the server has it, then what the server says", () =>
    Effect.gen(function* () {
      const restocks = yield* Restocks
      const warehouse = yield* Warehouse
      const stock = yield* Stock.ask()

      yield* until(stock.value.get, (value) => value === 3)
      yield* restocks.restock(9)
      yield* until(stock.value.get, (value) => value === 9)
      expect([yield* Ref.get(warehouse.stock), yield* Ref.get(warehouse.asked)]).toEqual([3, 1])

      yield* Deferred.succeed(warehouse.open, undefined)
      yield* until(stock.value.get, (value) => value === 10)
      expect(yield* Ref.get(warehouse.asked)).toBe(2)
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )

  it.live(
    "a change whose send fails for good is taken back: the query loads what the server has",
    () =>
      Effect.gen(function* () {
        const restocks = yield* Restocks
        const warehouse = yield* Warehouse
        const outbox = yield* Outbox.Outbox
        const stock = yield* Stock.ask()

        yield* until(stock.value.get, (value) => value === 3)
        yield* restocks.restock(9)
        yield* until(outbox.dead.get, (dead) => dead.length === 1)
        yield* until(stock.value.get, (value) => value === 3)
        yield* Effect.sleep("50 millis")
        expect(yield* stock.value.get).toBe(3)

        const reloaded = yield* Ref.get(warehouse.asked)

        expect(reloaded).toBeGreaterThan(1)

        yield* outbox.discard((yield* outbox.dead.get)[0]?.key ?? "")
        yield* until(outbox.dead.get, (dead) => dead.length === 0)
        expect(yield* Ref.get(warehouse.asked)).toBe(reloaded)
      }).pipe(Effect.scoped, Effect.provide(refusing)),
  )
})
