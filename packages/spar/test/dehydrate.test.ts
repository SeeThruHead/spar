import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, Query, Reactive, Router, Server, Store, UiState, compose } from "spar"
import * as Spans from "spar/devtools/spans"
import * as Testing from "spar/testing"
import { RowsView } from "./graphics.tsx"
import { NotFoundView } from "./routes.tsx"
import { ShelfView } from "./shelf.tsx"
import { OrdersView } from "./units.tsx"

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
  compose(
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

const inBrowser = Shelf.layer.pipe(Layer.provide(SecureRandom.layerWebCrypto))

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

class Asked extends Context.Service<Asked, Ref.Ref<ReadonlyArray<string>>>()("test/Asked") {
  static readonly layer = Layer.effect(Asked, Ref.make<ReadonlyArray<string>>([]))
}

const answering = <A>(what: string, value: A) =>
  Effect.flatMap(Effect.service(Asked), (asked) =>
    Effect.as(
      Effect.andThen(
        Ref.update(asked, (all) => [...all, what]),
        Effect.sleep("5 millis"),
      ),
      value,
    ),
  )

class Catalog extends Query.Tag<Catalog>()("test/Catalog", {
  input: Schema.Void,
  success: Schema.Array(Schema.String),
  failure: Schema.Never,
  load: () => answering("catalog", ["tea", "ink", "pen"]),
  staleAfter: "1 minute",
}) {}

class Price extends Query.Tag<Price>()("test/Price", {
  input: Schema.String,
  success: Schema.Finite,
  failure: Schema.Never,
  load: (item: string) => answering(`price of ${item}`, item.length),
  staleAfter: "1 minute",
}) {}

class Note extends Query.Tag<Note>()("test/Note", {
  input: Schema.Void,
  success: Schema.String,
  failure: Schema.Never,
  staleAfter: "0 millis",
  load: () => answering("note", "kept"),
}) {}

const Noted = compose(
  Effect.fnUntraced(function* () {
    const note = yield* Note.ask()

    return { status: note.status, count: Reactive.map(note.value, (found) => found?.length ?? 0) }
  }),
)(OrdersView)

const Priced = compose(
  Effect.fnUntraced(function* () {
    const catalog = yield* Catalog.ask()
    const price = yield* Price.ask(
      Reactive.map(catalog.value, (items) => Option.fromNullishOr(items?.[0])),
    )

    return { status: price.status, count: Reactive.map(price.value, (found) => found ?? 0) }
  }),
)(OrdersView)

const Routed = compose(
  Effect.fnUntraced(function* () {
    return {
      rows: yield* Router.outlet({
        routes: [Router.on(Router.route("/orders"), Priced)],
        otherwise: NotFoundView,
      }),
    }
  }),
)(RowsView)

const ShelfPage = Shelf.with(
  compose(
    Effect.fnUntraced(function* () {
      const shelf = yield* Shelf
      const catalog = yield* Catalog.ask()
      const both = yield* Reactive.zip(catalog.value, shelf.select.items)

      return {
        status: catalog.status,
        count: Reactive.map(both, ([items, kept]) => (items?.length ?? 0) + kept.length),
      }
    }),
  )(OrdersView),
)

const RoutedShelf = compose(
  Effect.fnUntraced(function* () {
    return {
      rows: yield* Router.outlet({
        routes: [Router.on(Router.route("/shelf"), ShelfPage)],
        otherwise: NotFoundView,
      }),
    }
  }),
)(RowsView)

const queries = Layer.merge(Catalog.live, Price.live).pipe(
  Layer.provideMerge(Asked.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
)

describe("a page whose data comes from queries, drawn on the server", () => {
  it.live("the server waits for every query, dependent ones too, and sends what they loaded", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(Priced, { layer: queries })

      expect(made.html).toContain('<output aria-label="Orders status">loaded</output>')
      expect(made.html).toContain('<output aria-label="Orders count">3</output>')
      expect(Object.keys(made.state.stores)).toEqual(["test/Catalog", "test/Price"])
      expect(JSON.stringify(made.state.stores)).toContain('"value":["tea","ink","pen"]')
    }),
  )

  it.live("it waits too for queries that only start once a routed page is drawn", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(Routed, {
        layer: Layer.merge(queries, Router.Router.layerMemory("/orders")),
      })

      expect(made.html).toContain('<output aria-label="Orders status">loaded</output>')
      expect(made.html).toContain('<output aria-label="Orders count">3</output>')
      expect(JSON.stringify(made.state.stores)).not.toContain('"status":"loading"')
    }),
  )

  it.live("a store beside a routed page is sent once, however many times the page is drawn", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(RoutedShelf, {
        layer: Layer.mergeAll(
          queries,
          Router.Router.layerMemory("/shelf"),
          SecureRandom.layerWebCrypto,
        ),
      })

      expect(made.html).toContain('<output aria-label="Orders status">loaded</output>')
      expect(
        Object.keys(made.state.stores).filter((key) => key.startsWith("test/Shelf")),
      ).toHaveLength(1)
    }),
  )

  it.live(
    "data a query with a stale time of 0 sent with the page is used once, then asked for again",
    () =>
      Effect.gen(function* () {
        const noted = Note.live.pipe(Layer.provideMerge(Asked.layer))
        const made = yield* Server.render(Noted, { layer: noted })

        expect(JSON.stringify(made.state.stores["test/Note"])).toContain('"ahead":["null"]')

        const built = yield* Effect.provideService(
          Layer.build(noted),
          Store.Seed,
          made.state.stores,
        )
        const asked = Context.get(built, Asked)

        yield* Effect.provide(
          Effect.gen(function* () {
            const first = yield* Note.ask()

            expect([yield* first.value.get, yield* Ref.get(asked)]).toEqual(["kept", []])

            yield* Note.ask()
            yield* Effect.sleep("10 millis")
            expect(yield* Ref.get(asked)).toEqual(["note"])
          }),
          built,
        )
      }),
  )

  it.live("the browser starts with that data in hand and asks for nothing again", () =>
    Effect.gen(function* () {
      const made = yield* Server.render(Priced, { layer: queries })
      const built = yield* Effect.provideService(
        Layer.build(queries),
        Store.Seed,
        made.state.stores,
      )
      const taken = yield* Effect.provide(
        Effect.gen(function* () {
          const catalog = yield* Catalog.ask()
          const price = yield* Price.ask("tea")
          const asked = yield* Effect.service(Asked)

          yield* Effect.sleep("10 millis")

          return [
            yield* catalog.status.get,
            yield* catalog.value.get,
            yield* price.value.get,
            yield* Ref.get(asked),
          ]
        }),
        built,
      )

      expect(taken).toEqual(["loaded", ["tea", "ink", "pen"], 3, []])
    }),
  )
})

const piecesOf = (parts: ReadonlyArray<string>): ReadonlyArray<unknown> =>
  parts.flatMap((part) => {
    const found =
      /^<script>\(self\.__sparPieces=self\.__sparPieces\|\|\[\]\)\.push\((.*)\)<\/script>$/.exec(
        part,
      )

    return found === null
      ? []
      : [Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(found[1])]
  })

const ordersStatus = () => document.querySelector('[aria-label="Orders status"]')?.textContent

const pushPiece = (piece: unknown) =>
  Effect.sync(() => {
    const holding: unknown = Reflect.get(globalThis, "__sparPieces")

    Reflect.apply(Object(Reflect.get(Object(holding), "push")), holding, [piece])
  })

const sentInPieces = Server.renderInPieces(Routed, {
  layer: Layer.merge(queries, Router.Router.layerMemory("/orders")),
  open: "<main>",
  close: "</main>",
  script: "<script async></script>",
  end: "</body>",
})

describe("a page sent in pieces", () => {
  it.live("goes out as first drawn, then each query's data follows as it lands", () =>
    Effect.gen(function* () {
      const parts = yield* Stream.runCollect(sentInPieces)
      const pieces = JSON.stringify(piecesOf(parts))

      expect([parts[0], parts[2], parts[5], parts.at(-1)]).toEqual([
        "<main>",
        "</main>",
        "<script async></script>",
        "</body>",
      ])
      expect(parts[4]).toContain("<noscript><style>")
      expect(parts[4]).toContain("body:has(noscript[data-spar-round]) #root{display:none}")
      expect(parts.at(-2)).toContain('"done":true')
      expect(parts[3]).toContain('"pieces":true')
      expect(parts.every((part) => part.startsWith("<"))).toBe(true)
      expect(
        parts.filter((part) => part.startsWith("<noscript data-spar-round>")).at(-1),
      ).toContain('<output aria-label="Orders count">3</output>')
      expect(parts[1]).toContain('<output aria-label="Orders status">waiting</output>')
      expect(parts[3]).toContain('id="spar-state"')
      expect(parts[3]).toContain('"status":"loading"')
      expect(piecesOf(parts).length).toBeGreaterThanOrEqual(2)
      expect(pieces).toContain('"value":["tea","ink","pen"]')
      expect(pieces).toContain('"value":3')
      expect(pieces).not.toContain("test/Shelf")
      expect(pieces).not.toContain('{"stores":{}}')
      expect(pieces).not.toContain('"test/Price":{"entries":{}}')

      const drawn = parts.filter((part) => part.startsWith("<template data-spar-piece>"))

      expect(drawn.length).toBeGreaterThanOrEqual(1)
      expect(drawn.at(-1)).toContain('<output aria-label="Orders status">loaded</output>')
      expect(drawn.at(-1)).toContain('<output aria-label="Orders count">3</output>')
      expect(drawn.at(-1)).toContain('document.querySelector("#root")')
      expect(drawn.at(-1)).toContain('r.hasAttribute("data-spar-taken")')
      expect(drawn.join("")).toContain("createRange")
      expect(drawn.join("")).not.toContain("replaceChildren")
      expect(parts[1]).toContain("<!--spar(-->")
    }),
  )

  it.live(
    "is drawn again whole when what changed is the page's own markup, outside every part",
    () =>
      Effect.gen(function* () {
        const parts = yield* Stream.runCollect(
          Server.renderInPieces(Priced, {
            layer: queries,
            open: "<main>",
            close: "</main>",
            script: "",
            end: "",
          }),
        )
        const drawn = parts.filter((part) => part.startsWith("<template data-spar-piece>"))

        expect(drawn.at(-1)).toContain("replaceChildren")
        expect(drawn.at(-1)).toContain('<output aria-label="Orders count">3</output>')
      }),
  )

  it.live(
    "each piece says in the trace how many parts it sends and whether it is the whole page",
    () =>
      Effect.gen(function* () {
        const spans = yield* Layer.build(Spans.layer())
        const buffer = Context.get(spans, Spans.SpanBuffer)
        const traced = (name: string) =>
          buffer
            .recent()
            .filter((span) => span.name === "Server.piece")
            .map((span) => [name, span.attributes["spar.whole"], span.attributes["spar.parts"]])

        yield* Effect.provide(Stream.runDrain(sentInPieces), spans)

        const inParts = traced("in parts")

        yield* Effect.provide(
          Stream.runDrain(
            Server.renderInPieces(Priced, {
              layer: queries,
              open: "",
              close: "",
              script: "",
              end: "",
            }),
          ),
          spans,
        )

        const whole = traced("whole").slice(inParts.length)

        expect(inParts).toContainEqual(["in parts", "false", "1"])
        expect(inParts.map(([, isWhole]) => isWhole)).not.toContain("true")
        expect(whole).toContainEqual(["whole", "true", "1"])
      }),
  )

  it.live("pieces that arrived before the app started are in its first draw", () =>
    Effect.gen(function* () {
      const parts = yield* Stream.runCollect(sentInPieces)
      const holder = yield* sentPage(`<div id="root">${parts[1]}</div>${parts[3]}`)
      const target = holder.querySelector("div") ?? holder
      const asked = yield* Layer.build(Asked.layer)
      const inPage = Layer.merge(Catalog.live, Price.live).pipe(
        Layer.provide(Layer.succeedContext(asked)),
        Layer.provide(SecureRandom.layerWebCrypto),
        Layer.merge(Router.Router.layerMemory("/orders")),
      )

      yield* Effect.acquireRelease(
        Effect.sync(() => Reflect.set(globalThis, "__sparPieces", piecesOf(parts))),
        () => Effect.sync(() => Reflect.deleteProperty(globalThis, "__sparPieces")),
      )
      yield* Effect.forkScoped(App.hydrate(Routed, { target, layer: inPage }), {
        startImmediately: true,
      })
      yield* Testing.eventually(() => expect(target.hasAttribute("data-spar-taken")).toBe(true))
      yield* Testing.eventually(() => expect(ordersStatus()).toBe("loaded"))
      expect(document.querySelector('[aria-label="Orders count"]')?.textContent).toBe("3")
      expect(yield* Ref.get(Context.get(asked, Asked))).toEqual([])
    }),
  )

  it.live("a layer that cannot be built fails the stream", () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        Stream.runCollect(
          Server.renderInPieces(Priced, {
            layer: Layer.merge(Catalog.live, Price.live).pipe(
              Layer.provideMerge(Layer.effect(Asked, Effect.fail("no database"))),
              Layer.provide(SecureRandom.layerWebCrypto),
            ),
            open: "",
            close: "",
            script: "",
            end: "",
          }),
        ),
      )

      expect(failed).toBe("no database")
    }),
  )

  it.live("the browser takes the pieces as they come and asks for nothing itself", () =>
    Effect.gen(function* () {
      const parts = yield* Stream.runCollect(sentInPieces)
      const [first, ...later] = piecesOf(parts)
      const holder = yield* sentPage(`<div id="root">${parts[1]}</div>${parts[3]}`)
      const target = holder.querySelector("div") ?? holder
      const asked = yield* Layer.build(Asked.layer)
      const inPage = Layer.merge(Catalog.live, Price.live).pipe(
        Layer.provide(Layer.succeedContext(asked)),
        Layer.provide(SecureRandom.layerWebCrypto),
        Layer.merge(Router.Router.layerMemory("/orders")),
      )
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          Object.defineProperty(document, "readyState", { value: "loading", configurable: true }),
        ),
        () => Effect.sync(() => Reflect.deleteProperty(document, "readyState")),
      )
      yield* Effect.acquireRelease(
        Effect.sync(() => Reflect.set(globalThis, "__sparPieces", [first])),
        () => Effect.sync(() => Reflect.deleteProperty(globalThis, "__sparPieces")),
      )
      yield* Effect.forkScoped(App.hydrate(Routed, { target, layer: inPage }), {
        startImmediately: true,
      })
      yield* Testing.eventually(() => expect(ordersStatus()).toMatch(/waiting|loading/))
      yield* pushPiece("not a piece")
      yield* pushPiece({ stores: { "test/Nowhere": {}, "test/Catalog": 5 } })
      yield* Effect.forEach(later, pushPiece)
      yield* Testing.eventually(() => expect(ordersStatus()).toBe("loaded"))
      expect(document.querySelector('[aria-label="Orders count"]')?.textContent).toBe("3")
      expect(yield* Ref.get(Context.get(asked, Asked))).toEqual([])
    }),
  )

  it.live(
    "what the pieces never bring is asked for by the browser once the server says it is done",
    () =>
      Effect.gen(function* () {
        const made = yield* Server.render(Routed, {
          layer: Layer.merge(queries, Router.Router.layerMemory("/orders")),
        })
        const state = {
          ...made.state,
          stores: { ...made.state.stores, "test/Price": { entries: {} } },
          pieces: true,
        }
        const holder = yield* sentPage(
          `<div id="root">${made.html}</div>${Server.stateScript(state)}`,
        )
        const asked = yield* Layer.build(Asked.layer)
        const inPage = Layer.merge(Catalog.live, Price.live).pipe(
          Layer.provide(Layer.succeedContext(asked)),
          Layer.provide(SecureRandom.layerWebCrypto),
          Layer.merge(Router.Router.layerMemory("/orders")),
        )

        yield* Effect.acquireRelease(
          Effect.sync(() =>
            Object.defineProperty(document, "readyState", { value: "loading", configurable: true }),
          ),
          () => Effect.sync(() => Reflect.deleteProperty(document, "readyState")),
        )
        yield* Effect.acquireRelease(
          Effect.sync(() => Reflect.set(globalThis, "__sparPieces", [])),
          () => Effect.sync(() => Reflect.deleteProperty(globalThis, "__sparPieces")),
        )
        yield* Effect.forkScoped(
          App.hydrate(Routed, { target: holder.querySelector("div") ?? holder, layer: inPage }),
          { startImmediately: true },
        )
        yield* Testing.eventually(() => expect(ordersStatus()).toBe("waiting"))
        yield* Effect.sleep("30 millis")
        expect(yield* Ref.get(Context.get(asked, Asked))).toEqual([])

        yield* pushPiece({ stores: {}, done: true })
        yield* Testing.eventually(() => expect(ordersStatus()).toBe("loaded"))
        expect(yield* Ref.get(Context.get(asked, Asked))).toEqual(["price of tea"])
      }),
  )

  it.live(
    "when the page ends before the server said it was done, the browser asks for what is missing",
    () =>
      Effect.gen(function* () {
        const made = yield* Server.render(Routed, {
          layer: Layer.merge(queries, Router.Router.layerMemory("/orders")),
        })
        const state = {
          ...made.state,
          stores: { ...made.state.stores, "test/Price": { entries: {} } },
          pieces: true,
        }
        const holder = yield* sentPage(
          `<div id="root">${made.html}</div>${Server.stateScript(state)}`,
        )
        const asked = yield* Layer.build(Asked.layer)
        const inPage = Layer.merge(Catalog.live, Price.live).pipe(
          Layer.provide(Layer.succeedContext(asked)),
          Layer.provide(SecureRandom.layerWebCrypto),
          Layer.merge(Router.Router.layerMemory("/orders")),
        )

        yield* Effect.acquireRelease(
          Effect.sync(() =>
            Object.defineProperty(document, "readyState", { value: "loading", configurable: true }),
          ),
          () => Effect.sync(() => Reflect.deleteProperty(document, "readyState")),
        )
        yield* Effect.acquireRelease(
          Effect.sync(() => Reflect.set(globalThis, "__sparPieces", [])),
          () => Effect.sync(() => Reflect.deleteProperty(globalThis, "__sparPieces")),
        )
        yield* Effect.forkScoped(
          App.hydrate(Routed, { target: holder.querySelector("div") ?? holder, layer: inPage }),
          { startImmediately: true },
        )
        yield* Testing.eventually(() => expect(ordersStatus()).toBe("waiting"))
        yield* Effect.sleep("30 millis")
        expect(yield* Ref.get(Context.get(asked, Asked))).toEqual([])

        yield* Effect.sync(() => document.dispatchEvent(new Event("DOMContentLoaded")))
        yield* Testing.eventually(() => expect(ordersStatus()).toBe("loaded"))
        expect(yield* Ref.get(Context.get(asked, Asked))).toEqual(["price of tea"])
      }),
  )
})

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
