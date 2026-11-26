import { Effect } from "effect"
import type { Scope } from "effect"
import { Renderer } from "../Renderer.ts"
import type { Html, Live } from "../Renderer.ts"

const isLive = (renderer: Live | Html): renderer is Live => renderer._tag === "Live"

const isHtml = (renderer: Live | Html): renderer is Html => renderer._tag === "Html"

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

const html: Effect.Effect<Html, never, Renderer> = Effect.filterOrElse(
  Effect.service(Renderer),
  isHtml,
  () =>
    Effect.die(
      new Error(
        "Server.render draws a page as text: give it Renderer.html in its layer, not a renderer that draws into a document",
      ),
    ),
)

export const drawn = (child: unknown): Effect.Effect<string, never, Renderer | Scope.Scope> =>
  Effect.flatMap(html, (renderer) => renderer.draw(child))
