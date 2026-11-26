import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient } from "effect/http"
import { Query, Router } from "spar"
import { Hit, NotKnown, Page } from "./api.ts"
import { Section } from "./content.ts"
import { searchIn } from "./library.ts"

const fetched = <A, I>(schema: Schema.Codec<A, I>, url: string) =>
  HttpClient.get(url).pipe(
    Effect.flatMap((answer) => answer.json),
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
  )

export class Shelves extends Context.Service<
  Shelves,
  {
    readonly page: (slug: string) => Effect.Effect<Page, NotKnown>
    readonly search: (text: string) => Effect.Effect<ReadonlyArray<Hit>>
  }
>()("site/Shelves") {
  static readonly layerFiles = (
    origin: string,
  ): Layer.Layer<Shelves, never, HttpClient.HttpClient> =>
    Layer.effect(
      Shelves,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const provided = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
          Effect.provideService(effect, HttpClient.HttpClient, client)
        const sections = yield* Effect.cached(
          provided(fetched(Schema.Array(Section), `${origin}/search.json`)).pipe(
            Effect.orElseSucceed((): ReadonlyArray<Section> => []),
          ),
        )

        return Shelves.of({
          page: (slug) =>
            provided(fetched(Page, `${origin}/pages/${slug}.json`)).pipe(
              Effect.mapError(() => new NotKnown({ what: slug })),
            ),
          search: (text) => Effect.flatMap(sections, (found) => searchIn(found)(text)),
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
