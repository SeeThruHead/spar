import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Deferred, Effect, Exit, Layer, Scope, SubscriptionRef } from "effect"
import { App, Reactive, Server } from "spar"
import * as Testing from "spar/testing"
import type { Fruit } from "./pages.tsx"
import { Page, fruits } from "./shop.ts"

type Shop = ReturnType<typeof Page>

const page = (target: HTMLElement) =>
  Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(target)),
    (node) => Effect.sync(() => node.remove()),
  )

const shownWith = Effect.fnUntraced(function* (
  html: string,
  component: Shop,
  show: typeof App.hydrate,
) {
  const target = document.createElement("div")

  target.insertAdjacentHTML("beforeend", html)
  yield* page(target)

  const kept = [...target.querySelectorAll("*")]

  yield* Effect.forkScoped(show(component, { target, layer: Layer.empty }), {
    startImmediately: true,
  })

  return { target, kept }
})

const shape = (html: string): string => html.replaceAll("<!---->", "").replaceAll(' value=""', "")

const settledHtml = (target: HTMLElement) =>
  Effect.andThen(
    Effect.sleep("30 millis"),
    Effect.sync(() => shape(target.innerHTML)),
  )

const freshlyMounted = Effect.fnUntraced(function* (component: Shop) {
  const scope = yield* Scope.make()
  const { target } = yield* Scope.provide(shownWith("", component, App.mount), scope)
  const html = yield* settledHtml(target)

  yield* Scope.close(scope, Exit.void)

  return html
})

describe("taking over a page a server sent", () => {
  it.live("the server's nodes are kept, and the page works and matches a fresh one", () =>
    Effect.gen(function* () {
      const list = yield* SubscriptionRef.make(fruits)
      const component = Page(Reactive.fromSubscriptionRef(list))
      const html = yield* Server.renderToString(component, { layer: Layer.empty })
      const fresh = yield* freshlyMounted(component)
      const { target, kept } = yield* shownWith(html, component, App.hydrate)

      expect(screen.queryByText("Loading the report")).toBeNull()
      expect(yield* settledHtml(target)).toBe(fresh)
      expect([...target.querySelectorAll("*")]).toEqual(kept)
      expect(kept.every((node) => node.isConnected)).toBe(true)

      yield* Effect.sync(() => fireEvent.click(screen.getByRole("button", { name: "Add <one>" })))
      yield* Testing.eventually(() =>
        expect(target.querySelector("p")?.textContent).toBe("Count: 3 items"),
      )
      yield* SubscriptionRef.set(list, [
        { id: "c", name: "Cherry" },
        { id: "a", name: "Apple" },
      ])
      yield* Testing.eventually(() =>
        expect([...target.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
          "Cherry",
          "Apple",
        ]),
      )

      expect(target.querySelector("li:last-child")).toBe(kept.find((node) => node.tagName === "LI"))
      expect([...target.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["c", "a"])
    }),
  )

  it.live("whatever the server sent that does not fit is put right", () =>
    Effect.gen(function* () {
      const list = yield* SubscriptionRef.make<ReadonlyArray<Fruit>>(fruits)
      const component = Page(Reactive.fromSubscriptionRef(list))
      const fresh = yield* freshlyMounted(component)
      const html = yield* Server.renderToString(component, { layer: Layer.empty })
      const spoiled = [
        html.replace("<h1>", "<h2>").replace("</h1>", "</h2>"),
        html.replace("<!--[-->", "").replace("<li>Apple</li>", "<li>Apple</li><li>Extra</li>"),
        html.replace("<br>", "<br><hr>stray text"),
        html.replace("<dt>a</dt>", "").replace("<!--,-->", "").replace("<!--]-->", ""),
        html.replace(/<!---->/g, "").replace("<output", "plain<output"),
        html.replace(/<!---->/g, ""),
        "<p>Something else entirely</p> and text",
      ]
      const repaired = yield* Effect.forEach(spoiled, (sent) =>
        Effect.scoped(
          Effect.flatMap(shownWith(sent, component, App.hydrate), ({ target }) =>
            settledHtml(target),
          ),
        ),
      )

      expect(repaired).toEqual(spoiled.map(() => fresh))
    }),
  )

  it.live("an app can say when its first picture is up, mounted or taken over", () =>
    Effect.gen(function* () {
      const component = Page(Reactive.succeed(fruits))
      const up = yield* Deferred.make<string>()
      const telling = (how: string) => Effect.asVoid(Deferred.succeed(up, how))
      const target = document.createElement("div")

      yield* page(target)
      yield* Effect.forkScoped(
        App.hydrate(component, { target, layer: Layer.empty, shown: telling("taken over") }),
        { startImmediately: true },
      )

      expect(yield* Deferred.await(up)).toBe("taken over")
      expect(target.querySelector("aside")?.textContent).toBe("3 lines")
    }),
  )

  it.live("an empty page is simply filled in", () =>
    Effect.gen(function* () {
      const component = Page(Reactive.succeed(fruits))
      const fresh = yield* freshlyMounted(component)
      const { target } = yield* shownWith("", component, App.hydrate)

      expect(yield* settledHtml(target)).toBe(fresh)
    }),
  )
})
