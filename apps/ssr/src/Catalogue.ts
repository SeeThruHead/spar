import { Context, Effect, Layer, Schema } from "effect"
import type { HttpClient } from "effect/http"
import { Backend, Query, Router } from "spar"
import { NotKnown, Product, Shelf, Supplier } from "./api.ts"

export class Catalogue extends Context.Service<
  Catalogue,
  {
    readonly product: (id: string) => Effect.Effect<Product, NotKnown>
    readonly supplier: (id: string) => Effect.Effect<Supplier, NotKnown>
  }
>()("ssr/Catalogue") {
  static readonly layerRemote = (
    url: string,
  ): Layer.Layer<Catalogue, never, HttpClient.HttpClient> =>
    Layer.effect(
      Catalogue,
      Effect.gen(function* () {
        const shelf = yield* Backend.rpc(Shelf, url)

        return Catalogue.of({
          product: (id) =>
            Effect.catchTag(shelf.Product({ id }), "RpcClientError", () =>
              Effect.fail(new NotKnown({ what: id })),
            ),
          supplier: (id) =>
            Effect.catchTag(shelf.Supplier({ id }), "RpcClientError", () =>
              Effect.fail(new NotKnown({ what: id })),
            ),
        })
      }),
    )
}

export class ProductQuery extends Query.Tag<ProductQuery>()("ssr/Product", {
  input: Schema.String,
  success: Product,
  failure: NotKnown,
  staleAfter: "30 seconds",
  load: (id: string) => Effect.flatMap(Effect.service(Catalogue), (found) => found.product(id)),
}) {}

export class SupplierQuery extends Query.Tag<SupplierQuery>()("ssr/Supplier", {
  input: Schema.String,
  success: Supplier,
  failure: NotKnown,
  staleAfter: "30 seconds",
  load: (id: string) => Effect.flatMap(Effect.service(Catalogue), (found) => found.supplier(id)),
}) {}

export const queries = Layer.merge(ProductQuery.live, SupplierQuery.live)

export const ProductParams = Schema.Struct({ id: Schema.String })

export const home = Router.route("/")

export const productRoute = Router.route("/shelf/:id", ProductParams)
