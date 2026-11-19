import { Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { HttpClient } from "effect/http"
import { Backend } from "spar"
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
).pipe(Layer.provide(Backend.layer))

export const layer = Layer.merge(ShopStore.layer(), overHttp).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
)
