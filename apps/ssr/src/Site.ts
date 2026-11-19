import { Effect, Option } from "effect"
import { Props, Reactive, Router, View } from "spar"
import { ProductParams, ProductQuery, SupplierQuery, home, productRoute } from "./Catalogue.ts"
import { Shop } from "./Shop.ts"
import { MissingView, ProductView, SiteView } from "./SiteView.tsx"

const ProductPage = View.taking(
  { params: Props.Reactive(ProductParams) },
  Effect.fnUntraced(function* ({ params }) {
    const router = yield* Router.Router
    const product = yield* ProductQuery.ask(Reactive.map(params, (now) => now.id))
    const supplier = yield* SupplierQuery.ask(
      Reactive.map(product.value, (found) => Option.fromNullishOr(found?.supplierId)),
    )

    return {
      name: Reactive.map(product.value, (found) => found?.name ?? ""),
      status: product.status,
      supplier: Reactive.map(supplier.value, (found) => found?.name ?? ""),
      supplierStatus: supplier.status,
      back: router.link(home, {}),
    }
  }),
)(ProductView)

export const Site = View.connect(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router

    return {
      cheese: router.link(productRoute, { id: "cheese" }),
      bread: router.link(productRoute, { id: "bread" }),
      page: yield* Router.outlet({
        routes: [Router.on(home, Shop), Router.live(productRoute, ProductPage)],
        otherwise: MissingView,
      }),
    }
  }),
)(SiteView)
