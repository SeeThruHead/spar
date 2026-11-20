import { Context, Effect, Layer, Schema } from "effect"
import type { HttpClient } from "effect/http"
import { Backend, Query, Router } from "spar"
import { Hit, Library, NotKnown, Page } from "./api.ts"

export class Shelves extends Context.Service<
  Shelves,
  {
    readonly page: (slug: string) => Effect.Effect<Page, NotKnown>
    readonly search: (text: string) => Effect.Effect<ReadonlyArray<Hit>>
  }
>()("site/Shelves") {
  static readonly layerRemote = (url: string): Layer.Layer<Shelves, never, HttpClient.HttpClient> =>
    Layer.effect(
      Shelves,
      Effect.gen(function* () {
        const library = yield* Backend.rpc(Library, url)

        return Shelves.of({
          page: (slug) =>
            Effect.catchTag(library.Page({ slug }), "RpcClientError", () =>
              Effect.fail(new NotKnown({ what: slug })),
            ),
          search: (text) => Effect.orElseSucceed(library.Search({ text }), () => []),
        })
      }),
    )
}

export class PageQuery extends Query.Tag<PageQuery>()("site/Page", {
  input: Schema.String,
  success: Page,
  failure: NotKnown,
  staleAfter: "10 minutes",
  load: (slug: string) => Effect.flatMap(Effect.service(Shelves), (shelves) => shelves.page(slug)),
}) {}

export class SearchQuery extends Query.Tag<SearchQuery>()("site/Search", {
  input: Schema.String,
  success: Schema.Array(Hit),
  failure: Schema.Never,
  staleAfter: "1 minute",
  load: (text: string) =>
    Effect.flatMap(Effect.service(Shelves), (shelves) => shelves.search(text)),
}) {}

export const queries = Layer.merge(PageQuery.live, SearchQuery.live)

export const DocParams = Schema.Struct({ slug: Schema.String })

export const home = Router.route("/")

export const docRoute = Router.route("/docs/:slug", DocParams)
