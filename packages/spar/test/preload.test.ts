import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Context, Deferred, Effect, Layer, Ref, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Query, Reactive, Router, compose, withProps } from "spar"
import * as Testing from "spar/testing"
import { DoorView, HallView, OrdersView } from "./units.tsx"

type Asked = {
  readonly userId: number
  readonly answer: Deferred.Deferred<ReadonlyArray<string>>
}

class Shop extends Context.Service<
  Shop,
  {
    readonly asked: Ref.Ref<ReadonlyArray<Asked>>
    readonly orders: (userId: number) => Effect.Effect<ReadonlyArray<string>>
  }
>()("test/Shop") {
  static readonly layer = Layer.effect(
    Shop,
    Effect.gen(function* () {
      const asked = yield* Ref.make<ReadonlyArray<Asked>>([])

      return Shop.of({
        asked,
        orders: Effect.fnUntraced(function* (userId: number) {
          const answer = yield* Deferred.make<ReadonlyArray<string>>()

          yield* Ref.update(asked, (all) => [...all, { userId, answer }])

          return yield* Deferred.await(answer)
        }),
      })
    }),
  )
}

class Orders extends Query.Tag<Orders>()("test/PreloadedOrders", {
  input: Schema.Finite,
  success: Schema.Array(Schema.String),
  failure: Schema.Never,
  load: (userId: number) => Effect.flatMap(Effect.service(Shop), (shop) => shop.orders(userId)),
  staleAfter: "1 minute",
}) {}

const home = Router.route("/")

const ordersOf = Router.route("/orders/:id", Schema.Struct({ id: Schema.FiniteFromString }))

const Door = compose(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router

    return { orders: router.link(ordersOf, { id: 7 }) }
  }),
)(DoorView)

const OrdersPage = compose(
  withProps({ id: Schema.Finite }),
  Effect.fnUntraced(function* ({ id }) {
    const orders = yield* Orders.ask(id)

    return {
      status: orders.status,
      count: Reactive.map(orders.value, (loaded) => loaded?.length ?? 0),
    }
  }),
)(OrdersView)

const Hall = compose(
  Effect.fnUntraced(function* () {
    return {
      page: yield* Router.outlet({
        routes: [Router.on(home, Door), Router.on(ordersOf, OrdersPage)],
        otherwise: Door,
      }),
    }
  }),
)(HallView)

const layer = Layer.mergeAll(Orders.live, Router.Router.layerMemory("/")).pipe(
  Layer.provideMerge(Shop.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
)

const askedFor = (count: number) =>
  Effect.flatMap(Effect.service(Shop), (shop) =>
    Effect.repeat(Ref.get(shop.asked), {
      until: (all) => all.length === count,
      schedule: Schedule.spaced("5 millis"),
    }),
  )

describe("preload on intent", () => {
  it.live("pointing at a link starts the target page's queries before the click", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Hall)

      const link = yield* Testing.find("link", "Orders of 7")

      fireEvent.pointerEnter(link)

      const asked = yield* askedFor(1)

      expect(asked.map((each) => each.userId)).toEqual([7])
      expect(screen.getByRole("heading").textContent).toBe("Home")

      yield* Effect.forEach(asked, (waiting) => Deferred.succeed(waiting.answer, ["tea", "ink"]))
      fireEvent.click(link)
      yield* Testing.eventually(() =>
        expect(
          ["Orders status", "Orders count"].map(
            (label) => document.querySelector(`[aria-label="${label}"]`)?.textContent,
          ),
        ).toEqual(["loaded", "2"]),
      )
      expect(yield* askedFor(1)).toHaveLength(1)
    }).pipe(Effect.provide(layer)),
  )

  it.live("focusing the link does the same, and outside an app there is nothing to rehearse", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router

      yield* router.preload(ordersOf, { id: 8 })
      yield* Testing.mount(Hall)

      const link = yield* Testing.find("link", "Orders of 7")

      fireEvent.focus(link)
      expect((yield* askedFor(1)).map((each) => each.userId)).toEqual([7])
    }).pipe(Effect.provide(layer)),
  )
})
