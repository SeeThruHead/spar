import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, Server, Store, UiState, View } from "spar"
import * as Spans from "spar/devtools/spans"
import * as Testing from "spar/testing"
import { ShelfView } from "./shelf.tsx"

const State = Schema.Struct({ items: Schema.Array(Schema.String) })

type State = typeof State.Type

class Shelf extends Store.Tag<Shelf>()("test/Shelf", {
  state: State,
  initialState: { items: [] },
  actions: {
    added: Store.action(Schema.Struct({ item: Schema.String }), (state: State, { item }) => ({
      items: [...state.items, item],
    })),
  },
  selectors: {
    items: Store.selector(Schema.Array(Schema.String), (state: State) => state.items),
  },
}) {}

const Shop = (note: string) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const shelf = yield* Shelf

      return {
        items: shelf.select.items,
        note: yield* UiState.make("note", Schema.String, note),
        onAdd: shelf.commands.added({ item: "tea" }),
      }
    }),
  )(ShelfView)

const database = Effect.succeed<State>({ items: ["<rice>", "beans"] })

const onServer = Shelf.layerFrom(database).pipe(Layer.provide(SecureRandom.layerWebCrypto))

const inBrowser = Shelf.layer().pipe(Layer.provide(SecureRandom.layerWebCrypto))

const sentPage = (document_: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const holder = document.body.appendChild(document.createElement("div"))

      holder.insertAdjacentHTML("beforeend", document_)

      return holder
    }),
    (holder) => Effect.sync(() => holder.remove()),
  )

const shown = (): ReadonlyArray<string | null> => {
  const note = screen.getByLabelText("Note")

  return [
    screen.getByLabelText("Items").textContent,
    note instanceof HTMLInputElement ? note.value : null,
  ]
}

describe("a page drawn on the server and taken over with its state", () => {
  it.live("the server draws from its own data and says what state it drew", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(Shop("written on the server"), { layer: onServer })

      expect(made.html).toContain("&lt;rice&gt;, beans")
      expect(made.state.stores).toEqual({ "test/Shelf": { items: ["<rice>", "beans"] } })
      expect(made.state.ui).toEqual([
        { path: ["ShelfView"], name: "note", value: "written on the server" },
      ])
      expect(made.state.trace?.traceId).toHaveLength(32)
      expect(yield* Server.renderToString(Shop("x"), { layer: onServer })).toContain("beans")
      expect(Server.stateScript(made.state)).toContain(
        '<script type="application/json" id="spar-state">{"stores":{"test/Shelf":{"items":["\\u003crice>","beans"]}}',
      )
    }),
  )

  it.live("the document can be sent in parts: the opening first, the state after the page", () =>
    Effect.gen(function* () {
      const parts = yield* Stream.runCollect(
        Server.renderToStream(Shop("streamed"), {
          layer: onServer,
          open: '<main id="root">',
          close: "</main>",
          end: "<footer></footer>",
        }),
      )

      expect(parts).toHaveLength(5)
      expect([parts[0], parts[2], parts[4]]).toEqual([
        '<main id="root">',
        "</main>",
        "<footer></footer>",
      ])
      expect(parts[1]).toContain("beans")
      expect(parts[3]).toContain('id="spar-state"')
    }),
  )

  it.live("the browser starts from the server's stores, UI state and trace", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(Shop("written on the server"), { layer: onServer })
      const holder = yield* sentPage(
        `<div id="root">${made.html}</div>${Server.stateScript(made.state)}`,
      )
      const spans = yield* Layer.build(Spans.layer())
      const target = holder.querySelector("div") ?? holder
      const kept = target.querySelector("output")

      yield* Effect.forkScoped(
        App.hydrate(Shop("typed in the browser"), { target, layer: inBrowser }),
        {
          startImmediately: true,
        },
      ).pipe(Effect.provide(spans))
      yield* Testing.eventually(() =>
        expect(shown()).toEqual(["<rice>, beans", "written on the server"]),
      )
      expect(target.querySelector("output")).toBe(kept)
      yield* Testing.click("button", "Add tea")
      yield* Testing.eventually(() => expect(shown()[0]).toBe("<rice>, beans, tea"))

      const taken = Context.get(spans, Spans.SpanBuffer)
        .recent()
        .filter((span) => span.name === "App.hydrate")

      expect(taken.map((span) => [span.traceId, span.parentSpanId])).toEqual([
        [made.state.trace?.traceId, made.state.trace?.spanId],
      ])
    }),
  )

  it.live("with nothing sent, or state that does not fit, the browser starts from its own", () =>
    Effect.gen(function* () {
      const holder = yield* sentPage(
        '<div id="root"></div><script type="application/json" id="spar-state">{"stores":{"test/Shelf":{"items":7}},"ui":[],"trace":null}</script>',
      )
      const target = holder.querySelector("div") ?? holder

      yield* Effect.forkScoped(App.hydrate(Shop("mine"), { target, layer: inBrowser }), {
        startImmediately: true,
      })
      yield* Testing.eventually(() => expect(shown()).toEqual(["", "mine"]))
    }),
  )

  it.live("a page with no state script at all is simply taken over", () =>
    Effect.gen(function* () {
      const holder = yield* sentPage('<div id="root"></div>')
      const target = holder.querySelector("div") ?? holder

      yield* Effect.forkScoped(App.hydrate(Shop("alone"), { target, layer: inBrowser }), {
        startImmediately: true,
      })
      yield* Testing.eventually(() => expect(shown()).toEqual(["", "alone"]))
    }),
  )
})
