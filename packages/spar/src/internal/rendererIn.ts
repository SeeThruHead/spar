import { Effect } from "effect"
import type { Scope } from "effect"
import { Renderer } from "../Renderer.ts"
import type { Html, Live } from "../Renderer.ts"

const isLive = (renderer: Live | Html): renderer is Live => renderer._tag === "Live"

export const live: Effect.Effect<Live, never, Renderer> = Effect.filterOrElse(
  Effect.service(Renderer),
  isLive,
  () =>
    Effect.die(
      new Error(
        "App.mount and App.hydrate draw into a page, a document or a terminal: give them Renderer.dom, Renderer.into or a terminal layer, not Renderer.html",
      ),
    ),
)

export const drawn = (child: unknown): Effect.Effect<string, never, Renderer | Scope.Scope> =>
  Effect.flatMap(Effect.service(Renderer), (renderer) =>
    isLive(renderer)
      ? Effect.die(
          new Error(
            "Server.render draws a page as text: give it Renderer.html in its layer, not a renderer that draws into a document",
          ),
        )
      : renderer.draw(child),
  )
