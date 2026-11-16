import { Context, Effect, Layer, Ref, Schema } from "effect"

export class ServerUnreachable extends Schema.TaggedError<
  ServerUnreachable,
  { readonly brand: unique symbol }
>()("ServerUnreachable", {}) {
  override get message() {
    return "The server did not answer. Your change is saved here and will be sent again."
  }
}

export class Server extends Context.Service<
  Server,
  {
    readonly start: (name: string, idempotencyKey: string) => Effect.Effect<void, ServerUnreachable>
    readonly started: Effect.Effect<ReadonlyArray<string>>
  }
>()("sidebar/Server") {
  static readonly layer = Layer.effect(
    Server,
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const attempts = yield* Ref.make(0)

      const start = Effect.fn("Server.start")(function* (name: string, idempotencyKey: string) {
        const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1)

        yield* Effect.annotateCurrentSpan({ "agent.name": name, "idempotency.key": idempotencyKey })
        yield* Effect.sleep("150 millis")

        if (attempt % 2 === 1) return yield* new ServerUnreachable()

        yield* Ref.update(seen, (all) => [...new Set([...all, idempotencyKey])])
      })

      return Server.of({ start, started: Ref.get(seen) })
    }),
  )
}
