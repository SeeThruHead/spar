import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { State as OneState, Store } from "spar"
import * as Spans from "spar/devtools/spans"

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

describe("tracing", () => {
  it.effect("a command runs in a span named after its store and action", () =>
    Effect.gen(function* () {
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)

      yield* Effect.gen(function* () {
        const visits = yield* Visits

        yield* visits.commands.visited()
      }).pipe(
        Effect.provide(Visits.layer.pipe(Layer.provideMerge(OneState.layer))),
        Effect.provide(spans),
      )

      expect(
        buffer
          .recent()
          .filter((span) => span.name.startsWith("test/Visits/"))
          .map((span) => [
            span.name,
            span.attributes["spar.store"],
            span.attributes["spar.action"],
          ]),
      ).toEqual([["test/Visits/visited", "test/Visits", "visited"]])
    }),
  )
})
