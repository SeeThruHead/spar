import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Reactive, Server } from "spar"
import { fragment, intrinsic, portal } from "../src/internal/element.ts"
import { noPage } from "../src/internal/frame.ts"
import { toHtml } from "../src/internal/html.ts"
import { Page, fruits } from "./shop.ts"

describe("rendering on a server", () => {
  it.live("a page becomes HTML with its values, lists and loaded parts in place", () =>
    Effect.gen(function* () {
      const html = yield* Server.renderToString(Page(Reactive.succeed(fruits)), {
        layer: Layer.empty,
      })

      expect(html).toBe(
        [
          '<main class="page" data-kind="shop">',
          "<h1>Fruit<!--,--> &amp; <em>more</em></h1>",
          '<p class="is-busy loud" style="color: red; --gap: 4">Count: <!--,-->2<!--,--><!--,--> items</p>',
          '<input type="text" value="" tabindex="0" disabled="" aria-busy="true">',
          "<br>",
          '<i aria-hidden="true"></i>',
          '<button type="button">Add <!--,-->&lt;one&gt;</button>',
          '<output aria-label="Connection">online</output>',
          "<ul><!--[--><li>Apple</li><li>Bread &amp; butter</li><!--]--></ul>",
          "<dl><!--[--><!----><dt>a</dt><dd>Apple</dd><!----><!----><dt>b</dt><dd>Bread &amp; butter</dd><!----><!--]--></dl>",
          "<aside>3<!--,--> lines</aside>",
          "</main>",
        ].join(""),
      )
    }),
  )

  it.live("an empty list still leaves its markers, and nothing of a dialog is sent", () =>
    Effect.gen(function* () {
      const html = yield* Server.renderToString(Page(Reactive.succeed([])), { layer: Layer.empty })

      expect(html).toContain("<ul><!--[--><!--]--></ul>")
      expect(html).not.toContain("dialog")
      expect(html).not.toContain("Loading the report")
    }),
  )

  it.effect("a layer opened over the page has no place in what a server sends", () =>
    Effect.gen(function* () {
      const html = yield* toHtml([
        "before",
        portal(document.createElement("div"), fragment(["inside"])),
        "after",
      ])

      expect(html).toBe("before<!--,-->after")
    }),
  )

  it.effect("attributes, classes and styles are written the way a browser reads them", () =>
    Effect.gen(function* () {
      const html = yield* toHtml(
        intrinsic("a", {
          title: 'say "hi" & <wave>',
          once: "kept",
          onClick: [],
          class: { " first ": true, second: true, third: false },
          tabIndex: 2,
          children: ["go", true, "now"],
        }),
      )
      const styled = yield* toHtml(intrinsic("p", { style: "color: red", class: "plain" }))

      expect(html).toBe(
        '<a title="say &quot;hi&quot; &amp; &lt;wave&gt;" once="kept" class="first second" tabindex="2">go<!--,-->now</a>',
      )
      expect(styled).toBe('<p style="color: red" class="plain"></p>')
    }),
  )

  it.effect("elements that cannot hold anything are not closed", () =>
    Effect.gen(function* () {
      const tags = [
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "source",
        "track",
        "wbr",
      ]
      const html = yield* Effect.forEach(tags, (tag) => toHtml(intrinsic(tag, {})))

      expect(html).toEqual(tags.map((tag) => `<${tag}>`))
      expect(yield* toHtml(intrinsic("span", {}))).toBe("<span></span>")
    }),
  )

  it("there is no page to reach for on a server", () => {
    expect(() => noPage.target).toThrow("There is no page on a server")
    expect(() => noPage.overlays).toThrow("There is no page on a server")
  })
})
