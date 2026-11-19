import { Context, Effect, Layer, Ref } from "effect"
import type { HttpClient } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Agents, NoRecord, ServerUnreachable } from "./api.ts"
import type { Started } from "./api.ts"

export { NoRecord, ServerUnreachable }

export class Server extends Context.Service<
  Server,
  {
    readonly start: (name: string, idempotencyKey: string) => Effect.Effect<void, ServerUnreachable>
    readonly started: Effect.Effect<ReadonlyArray<string>>
    readonly describe: (name: string) => Effect.Effect<Started, NoRecord | ServerUnreachable>
  }
>()("sidebar/Server") {
  static readonly layer = Layer.effect(
    Server,
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<Started>>([])
      const attempts = yield* Ref.make(0)

      const describe = Effect.fn("Server.describe")(function* (name: string) {
        const all = yield* Ref.get(seen)

        return yield* Effect.mapError(
          Effect.fromNullishOr(all.findLast((known) => known.name === name)),
          () => new NoRecord({ agent: name }),
        )
      })

      const start = Effect.fn("Server.start")(function* (name: string, idempotencyKey: string) {
        const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1)

        yield* Effect.annotateCurrentSpan({ "agent.name": name, "idempotency.key": idempotencyKey })
        yield* Effect.sleep("150 millis")

        if (attempt % 2 === 1) return yield* new ServerUnreachable()

        yield* Ref.update(seen, (all) => [
          ...all.filter((known) => known.key !== idempotencyKey),
          { name, key: idempotencyKey },
        ])
      })

      return Server.of({
        start,
        started: Effect.map(Ref.get(seen), (all) => all.map((known) => known.key)),
        describe,
      })
    }),
  )

  static readonly layerRemote = (url: string): Layer.Layer<Server, never, HttpClient.HttpClient> =>
    Layer.effect(
      Server,
      Effect.gen(function* () {
        const agents = yield* RpcClient.make(Agents)

        return Server.of({
          start: (name, idempotencyKey) =>
            Effect.catchTag(agents.Start({ name, idempotencyKey }), "RpcClientError", () =>
              Effect.fail(new ServerUnreachable()),
            ),
          started: Effect.orElseSucceed(agents.Started(), () => []),
          describe: (name) =>
            Effect.catchTag(agents.Describe({ name }), "RpcClientError", () =>
              Effect.fail(new ServerUnreachable()),
            ),
        })
      }),
    ).pipe(
      Layer.provide(RpcClient.layerProtocolHttp({ url })),
      Layer.provide(RpcSerialization.layerNdjson),
    )
}
