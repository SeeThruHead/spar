import { Context, Effect, Layer } from "effect"
import { App, Backend } from "spar"
import * as Spans from "spar/devtools/spans"
import { layer } from "./client.ts"
import { Site } from "./Site.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))
  const spans = yield* Layer.build(Spans.layer())
  const buffer = Context.get(spans, Spans.SpanBuffer)

  return yield* Effect.provide(
    App.hydrate(Site, {
      target,
      layer,
      shown: Effect.andThen(
        Effect.suspend(() => Backend.beacon("/client-spans", Spans.textOf(buffer.recent()))),
        Effect.sync(() => target.setAttribute("data-ready", "")),
      ),
    }),
    spans,
  )
})

Effect.runFork(Effect.scoped(program))
