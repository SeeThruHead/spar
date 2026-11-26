import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Query, State } from "spar"
import { statusIn } from "./results.ts"

class Opened extends Context.Service<Opened, Ref.Ref<ReadonlyArray<string>>>()("test/Opened") {
  static readonly layer = Layer.effect(Opened, Ref.make<ReadonlyArray<string>>([]))
}

const noted = (line: string) =>
  Effect.flatMap(Effect.service(Opened), (lines) => Ref.update(lines, (all) => [...all, line]))

class Held extends Query.Tag<Held>()("test/Held", {
  input: Schema.Int,
  success: Schema.Int,
  failure: Schema.Never,
  load: (id: number) =>
    Effect.as(
      Effect.acquireRelease(noted(`opened ${id}`), () => noted(`closed ${id}`)),
      id,
    ),
}) {}

const loaded = (handle: Query.Handle<number, never>): Effect.Effect<void> =>
  Effect.flatMap(handle.result.get, (result) =>
    statusIn(result) === "loaded" ? Effect.void : Effect.andThen(Effect.yieldNow, loaded(handle)),
  )

describe("a query's load", () => {
  it.effect("closes what it opened when the load ends, not when the query store goes", () =>
    Effect.gen(function* () {
      const built = yield* Layer.build(
        Held.live.pipe(
          Layer.provideMerge(Opened.layer),
          Layer.provideMerge(SecureRandom.layerWebCrypto),
          Layer.provideMerge(State.layer),
        ),
      )
      const lines = yield* Effect.provide(Effect.service(Opened), built)
      const handle = yield* Effect.provide(Held.ask(1), built)

      yield* loaded(handle)

      expect(yield* Ref.get(lines)).toEqual(["opened 1", "closed 1"])
    }).pipe(Effect.scoped),
  )
})
