import { Effect } from "effect"
import { App } from "spar"
import { layer } from "./client.ts"
import { Site } from "./Site.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.hydrate(Site, {
    target,
    layer,
    shown: Effect.sync(() => target.setAttribute("data-ready", "")),
  })
})

export const start = (): void => {
  Effect.runFork(Effect.scoped(program))
}
