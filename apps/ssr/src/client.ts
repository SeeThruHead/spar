import { Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { HttpClient } from "effect/http"
import { Backend, Router } from "spar"
import { Catalogue, queries } from "./Catalogue.ts"
import { Stockroom } from "./Shop.ts"
import { ShopStore } from "./ShopStore.ts"

const Counted = Schema.Struct({ count: Schema.Int })

const overHttp = Layer.effect(
  Stockroom,
  Effect.map(Effect.service(HttpClient.HttpClient), (http) => ({
    count: http.get(`${location.origin}/stock`).pipe(
      Effect.flatMap((answer) => answer.json),
      Effect.flatMap(Schema.decodeUnknownEffect(Counted)),
      Effect.map((counted) => counted.count),
      Effect.orElseSucceed(() => 0),
    ),
  })),
)

const fromTheServer = Layer.provide(queries, Catalogue.layerRemote(`${location.origin}/rpc`))

export const layer = Layer.mergeAll(ShopStore.layer(), overHttp, fromTheServer).pipe(
  Layer.provide(Backend.layer),
  Layer.provideMerge(Router.Router.layerBrowser),
  Layer.provide(SecureRandom.layerWebCrypto),
)
