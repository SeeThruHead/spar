import { Effect, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Props, Reactive, Router, compose, withProps } from "spar"
import {
  ProductParams,
  ProductQuery,
  SupplierQuery,
  home,
  nestedRoute,
  productRoute,
  slowRoute,
  twoAtOnceRoute,
} from "./Catalogue.ts"
import { Nested, TwoAtOnce } from "./Pair.tsx"
import { Shop } from "./Shop.ts"
import { MissingView, ProductView, SiteView } from "./SiteView.tsx"

const statusIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): string =>
  result.waiting
    ? "loading"
    : AsyncResult.match(result, {
        onInitial: () => "waiting",
        onFailure: () => "failed",
        onSuccess: () => "loaded",
      })

const ProductPage = compose(
  withProps({ params: Props.Reactive(ProductParams) }),
  Effect.fnUntraced(function* ({ params }) {
    const router = yield* Router.Router
    const product = yield* ProductQuery.ask(Reactive.map(params, (now) => now.id))
    const found = Reactive.map(product.result, AsyncResult.value)
    const supplier = yield* SupplierQuery.ask(
      Reactive.map(found, (shown) => Option.map(shown, (now) => now.supplierId)),
    )

    return {
      name: Reactive.map(found, (shown) =>
        Option.match(shown, { onNone: () => "", onSome: (now) => now.name }),
      ),
      status: Reactive.map(product.result, statusIn),
      supplier: Reactive.map(supplier.result, (result) =>
        Option.match(AsyncResult.value(result), { onNone: () => "", onSome: (now) => now.name }),
      ),
      supplierStatus: Reactive.map(supplier.result, statusIn),
      back: router.link(home, {}),
    }
  }),
)(ProductView)

export const Site = compose(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router

    return {
      cheese: router.link(productRoute, { id: "cheese" }),
      bread: router.link(productRoute, { id: "bread" }),
      page: yield* Router.outlet({
        routes: [
          Router.on(home, Shop),
          Router.on(twoAtOnceRoute, TwoAtOnce),
          Router.on(nestedRoute, Nested),
          Router.live(productRoute, ProductPage),
          Router.live(slowRoute, ProductPage),
        ],
        otherwise: MissingView,
      }),
    }
  }),
)(SiteView)
