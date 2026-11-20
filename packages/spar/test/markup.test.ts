import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, SubscriptionRef } from "effect"
import { App, Markup, Reactive, Server, View } from "spar"
import * as Testing from "spar/testing"
import { ArticleView } from "./markup.tsx"

const first = Markup.trusted("<h2>Why</h2><p>Because <em>types</em>.</p>")

const article = () => document.querySelector('[aria-label="Body"]')

describe("trusted markup", () => {
  it("is only what was marked as trusted: anything else is no HTML at all", () => {
    expect(Markup.htmlOf("<b>typed by a user</b>")).toBe("")
  })

  it.live("is put in the element as HTML, and again when it changes", () =>
    Effect.gen(function* () {
      const body = yield* SubscriptionRef.make(first)
      const Article = View.connect(() =>
        Effect.succeed({ body: Reactive.fromSubscriptionRef(body) }),
      )(ArticleView)

      yield* Testing.mount(Article)
      expect(article()?.innerHTML).toBe("<h2>Why</h2><p>Because <em>types</em>.</p>")

      yield* SubscriptionRef.set(body, Markup.trusted("<p>Next</p>"))
      yield* Testing.eventually(() => expect(article()?.innerHTML).toBe("<p>Next</p>"))
    }),
  )

  it.live("is drawn on the server, and hydrating keeps the nodes the server sent", () =>
    Effect.gen(function* () {
      const Article = View.connect(() => Effect.succeed({ body: Reactive.succeed(first) }))(
        ArticleView,
      )
      const html = yield* Server.renderToString(Article, { layer: Layer.empty })
      const target = document.createElement("div")

      expect(html).toContain(
        '<article aria-label="Body"><h2>Why</h2><p>Because <em>types</em>.</p></article>',
      )

      target.insertAdjacentHTML("beforeend", html)
      yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(target)),
        (node) => Effect.sync(() => node.remove()),
      )

      const sent = target.querySelector("em")

      yield* Effect.forkScoped(App.hydrate(Article, { target, layer: Layer.empty }), {
        startImmediately: true,
      })
      yield* Effect.sleep("20 millis")
      expect(target.querySelector("em")).toBe(sent)
      expect(target.querySelectorAll("article").length).toBe(1)
    }),
  )
})
