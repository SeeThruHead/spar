import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { State as OneState, Store } from "spar"
import * as Spans from "spar/devtools/spans"
import { Tree, UiTree } from "../src/internal/uiTree.ts"

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
  tasks: {
    cleared: Store.task(Schema.Void, {
      result: Schema.Void,
      run: () => Effect.withSpan(Effect.void, "test/Visits clearing"),
      finish: (): State => ({ visits: 0 }),
      mode: "switch",
    }),
  },
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

  it.effect("with the log kept, a command's span names the log entry it made", () =>
    Effect.gen(function* () {
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)
      const keeping = Layer.sync(UiTree, () => {
        const tree = new Tree()

        tree.keepAtLeast(10)

        return tree
      })

      const logged = yield* Effect.gen(function* () {
        const visits = yield* Visits
        const state = yield* OneState.current

        yield* visits.commands.visited()
        yield* visits.commands.visited()

        return (yield* state.log.get).map((entry) => String(entry.seq))
      }).pipe(Effect.provide(Visits.layer.pipe(Layer.provideMerge(keeping))), Effect.provide(spans))

      expect(
        buffer
          .recent()
          .filter((span) => span.name === "test/Visits/visited")
          .map((span) => span.attributes["spar.entry"]),
      ).toEqual(logged)
      expect(logged).toHaveLength(2)
    }),
  )

  it.effect("a task's finish runs in its own span, which names the log entry it made", () =>
    Effect.gen(function* () {
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)
      const keeping = Layer.sync(UiTree, () => {
        const tree = new Tree()

        tree.keepAtLeast(10)

        return tree
      })

      const logged = yield* Effect.gen(function* () {
        const visits = yield* Visits
        const state = yield* OneState.current

        yield* visits.tasks.cleared()
        yield* Effect.yieldNow

        return (yield* state.log.get).map((entry) => [entry.name, String(entry.seq)])
      }).pipe(Effect.provide(Visits.layer.pipe(Layer.provideMerge(keeping))), Effect.provide(spans))

      const finished = logged.filter(([name]) => name === "cleared finished")

      expect(finished).toHaveLength(1)
      expect(
        buffer
          .recent()
          .filter((span) => span.name === "test/Visits/cleared finished")
          .map((span) => span.attributes["spar.entry"]),
      ).toEqual(finished.map(([, seq]) => seq))
    }),
  )

  it.effect("a task's run sits under the span that started it, not where the store was built", () =>
    Effect.gen(function* () {
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)

      yield* Effect.gen(function* () {
        const visits = yield* Visits

        yield* visits.tasks.cleared()
        yield* Effect.yieldNow
      }).pipe(
        Effect.provide(Visits.layer.pipe(Layer.provideMerge(OneState.layer))),
        Effect.withSpan("test/building"),
        Effect.provide(spans),
      )

      const named = (name: string) => buffer.recent().filter((span) => span.name === name)

      expect(named("test/Visits clearing").map((span) => span.parentSpanId)).toEqual(
        named("test/Visits/cleared").map((span) => span.spanId),
      )
    }),
  )
})
