import { Effect, Option } from "effect"
import * as Devtools from "../Devtools.ts"
import * as Dom from "../internal/dom.ts"
import { Frame } from "../internal/frame.ts"
import { installed } from "../internal/hook.ts"
import type { Hook } from "../internal/hook.ts"
import { Inspecting, inspecting } from "../internal/inspect.ts"
import { renderInto } from "../internal/render.ts"
import * as Timeline from "../Timeline.ts"
import * as UiState from "../UiState.ts"
import * as View from "../View.ts"

const shown = Effect.fnUntraced(function* (
  registry: typeof Devtools.Registry.Service,
  overlays: HTMLElement,
) {
  const host = yield* Effect.acquireRelease(
    Effect.sync(() => Dom.addLayer(overlays)),
    (element) => Effect.sync(() => element.remove()),
  )
  const tools = yield* Effect.provideService(
    View.child(Devtools.Tools, {}),
    Devtools.Registry,
    registry,
  )

  yield* renderInto(tools, { parent: host, before: null, namespace: "html" }, undefined)
})

const apart = <A, E, R>(tools: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  tools.pipe(
    Effect.provideService(UiState.Tree, UiState.makeTree()),
    Effect.provideService(Timeline.Recorder, Option.none()),
  )

const attach: Hook["attach"] = Effect.gen(function* () {
  const frame = yield* Frame
  const registry = yield* Effect.serviceOption(Devtools.Registry)
  const tree = yield* UiState.Tree

  yield* Effect.forEach(
    Option.toArray(registry),
    (found) => {
      found.follow(tree)

      return apart(shown(found, frame.overlays))
    },
    {
      discard: true,
    },
  )
})

const hook: Hook = { wrap: (app) => Effect.provide(app, Devtools.layer), attach }

export const install = (): void => {
  inspecting.write(Option.some(new Inspecting()))
  installed.write(Option.some(hook))
}

export const uninstall = (): void => {
  inspecting.write(Option.none())
  installed.write(Option.none())
}
