import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Store } from "spar"

const State = Schema.Struct({ visits: Schema.Finite })

type State = typeof State.Type

const initialState: State = { visits: 0 }

class Visits extends Store.Tag<Visits>()("test/Visits", {
  state: State,
  initialState,
  actions: {
    visited: Store.action(Schema.Void, (state: State) => ({ visits: state.visits + 1 })),
  },
  selectors: { visits: Store.selector(Schema.Finite, (state: State) => state.visits) },
}) {}

type Seen = { readonly name: string; readonly store: unknown; readonly action: unknown }

const traced = (seen: Ref.Ref<ReadonlyArray<Seen>>) =>
  Visits.layer([
    Store.after(Visits.actions.visited, () =>
      Effect.currentParentSpan.pipe(
        Effect.flatMap((span) =>
          Ref.update(seen, (all) => [
            ...all,
            {
              name: span._tag === "Span" ? span.name : span.spanId,
              store: span._tag === "Span" ? span.attributes.get("spar.store") : undefined,
              action: span._tag === "Span" ? span.attributes.get("spar.action") : undefined,
            },
          ]),
        ),
        Effect.orDie,
      ),
    ),
  ]).pipe(Layer.provide(SecureRandom.layerWebCrypto))

describe("tracing", () => {
  it.effect("a command runs in a span named after its store and action", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<Seen>>([])

      yield* Effect.gen(function* () {
        const visits = yield* Visits

        yield* visits.commands.visited()
        yield* Effect.yieldNow
      }).pipe(Effect.provide(traced(seen)))

      expect(yield* Ref.get(seen)).toEqual([
        { name: "test/Visits/visited", store: "test/Visits", action: "visited" },
      ])
    }),
  )
})
