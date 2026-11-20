import { Context, Effect, Layer, Ref, Schema, Stream, SubscriptionRef } from "effect"

const Row = Schema.Struct({ id: Schema.Int, label: Schema.String })

class Rows extends Context.Service<Rows, SubscriptionRef.SubscriptionRef<ReadonlyArray<number>>>()(
  "parts/Rows",
) {
  static readonly layer = Layer.effect(Rows, SubscriptionRef.make<ReadonlyArray<number>>([]))
}

const program = Effect.gen(function* () {
  const rows = yield* Rows
  const seen = yield* Ref.make(0)
  const decoded = yield* Schema.decodeUnknownEffect(Row)({ id: 1, label: "one" })

  yield* Effect.forkScoped(
    Stream.runForEach(SubscriptionRef.changes(rows), (all) => Ref.set(seen, all.length)),
  )
  yield* SubscriptionRef.set(rows, [decoded.id])
  yield* Effect.withSpan(
    Effect.sync(() => document.body.append("ready")),
    "ready",
  )
})

Effect.runFork(Effect.scoped(Effect.provide(program, Rows.layer)))
