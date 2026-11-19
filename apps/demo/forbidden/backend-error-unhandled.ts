import { Effect, Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "effect/rpc"
import { App, View } from "spar"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

class ThreadGone extends Schema.TaggedError<ThreadGone, { readonly brand: unique symbol }>()(
  "ThreadGone",
  { id: Schema.String },
) {}

class Mail extends RpcGroup.make(
  Rpc.make("Load", { payload: { id: Schema.String }, success: Schema.String, error: ThreadGone }),
) {}

const backend = RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(FetchHttpClient.layer),
)

const Thread = View.connect(
  Effect.fnUntraced(function* () {
    const mail = yield* RpcClient.make(Mail)
    const id = yield* Effect.catchTag(mail.Load({ id: "welcome" }), "RpcClientError", Effect.die)

    return { id }
  }),
)(ThreadSkeletonView)

export const program = App.mount(Thread, { target: document.body, layer: backend })
