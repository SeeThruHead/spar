import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Layer, Ref } from "effect"
import { App, Reactive, Server, UiState, View } from "spar"
import * as Testing from "spar/testing"
import {
  Account,
  Calls,
  Counted,
  CounterStore,
  Dropdown,
  Gallery,
  OrdersQuery,
  Picker,
  ResetCounter,
  SessionStore,
  Shop,
  Ticker,
  Tags,
  Toolbar,
  Unnamed,
  resetAfterDelay,
  withHover,
} from "./composed.tsx"
import { Dialog, Greeter, Numbered, Resettable, Ten } from "./inference.tsx"

const text = (label: string) => screen.getByLabelText(label).textContent

const shows = (label: string, expected: string) =>
  Testing.eventually(() => expect(text(label)).toBe(expected))

const shop = Layer.succeed(Shop, {
  ordersOf: (userId: string) => Effect.succeed(userId === "ada" ? ["tea", "ink"] : ["pen"]),
})

const orders = Layer.mergeAll(SessionStore.layer(), OrdersQuery.live).pipe(Layer.provideMerge(shop))

const withTree = Layer.sync(UiState.Tree, UiState.makeTree)

describe("a component composed from enhancers, its view last and inline", () => {
  it.live("reads a store, sends its commands, and is refused while resetting", () =>
    Effect.gen(function* () {
      yield* Testing.mount(ResetCounter)
      yield* Testing.click("button", "Add 1")
      yield* shows("Count", "1")
      yield* Testing.click("button", "Reset after a delay")
      yield* Testing.click("button", "Add 1")
      yield* Testing.eventually(() =>
        expect(screen.getByRole("alert").textContent).toBe("it is not accepted while resetting"),
      )
      yield* shows("Count", "0")
      yield* Effect.sync(() => fireEvent.keyDown(window, { key: "a" }))
      yield* Effect.sync(() => fireEvent.keyDown(window, { key: "+" }))
      yield* shows("Count", "1")
    }).pipe(Effect.provide(Layer.merge(CounterStore.layer([resetAfterDelay]), withTree))),
  )

  it.live("renders child components in JSX, each with its own open state and nothing wired", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Toolbar)
      yield* Testing.click("button", "Sort by")
      yield* Testing.find("menu", "Sort by")

      expect(screen.queryByRole("menu", { name: "Show" })).toBeNull()

      yield* Testing.click("menuitem", "Oldest")
      yield* shows("Sort", "Oldest")
      yield* Testing.gone("menu", "Sort by")
      yield* Testing.click("button", "Show")
      yield* Testing.find("menu", "Show")
      yield* Effect.sync(() => fireEvent.keyDown(window, { key: "Escape" }))
      yield* Testing.gone("menu", "Show")
      yield* Testing.click("button", "Show")
      yield* Testing.click("menuitem", "Mine")
      yield* shows("Shown", "Mine")
      yield* shows("Sort", "Oldest")

      const tree = yield* UiState.snapshot

      expect(tree.map((piece) => [piece.path.join(" / "), piece.name])).toEqual([
        ["Toolbar", "sort"],
        ["Toolbar", "show"],
        ["Toolbar / Dropdown", "open"],
        ["Toolbar / Dropdown#2", "open"],
      ])
    }).pipe(Effect.provide(withTree)),
  )

  it.live("passes a store's value down as a prop, and the child asks its query with it", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Account)
      yield* shows("Orders", "2 orders")
      yield* Testing.click("button", "Switch user")
      yield* shows("User", "grace")
      yield* shows("Orders", "1 orders")
    }).pipe(Effect.provide(Layer.merge(orders, withTree))),
  )

  it.live("adds one behaviour, itself made of enhancers, to two different components", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Gallery)

      const card = yield* Testing.find("article", "Release notes")
      const avatar = screen.getByRole("figure", { name: "ada" })

      expect(avatar.textContent).toContain("A")
      expect(screen.getByRole("list", { name: "Tags" }).textContent).toBe("onetwo")

      yield* Effect.sync(() => fireEvent.pointerEnter(card))
      yield* Testing.eventually(() => expect(card.classList.contains("raised")).toBe(true))
      yield* Effect.sync(() => fireEvent.pointerEnter(avatar))
      yield* Testing.eventually(() =>
        expect(avatar.querySelector("figcaption")?.hidden).toBe(false),
      )
    }).pipe(Effect.provide(withTree)),
  )

  it.live("is drawn on the server, and hydrating keeps the nodes the server sent", () =>
    Effect.gen(function* () {
      const html = yield* Server.renderToString(Toolbar, { layer: Layer.empty })
      const target = document.createElement("div")

      expect(html).toContain("Sort by")
      expect(html).toContain('<output aria-label="Sort">Newest</output>')

      target.insertAdjacentHTML("beforeend", html)
      yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(target)),
        (node) => Effect.sync(() => node.remove()),
      )

      const sent = target.querySelector("button")

      yield* Effect.forkScoped(App.hydrate(Toolbar, { target, layer: Layer.empty }), {
        startImmediately: true,
      })
      yield* Effect.sleep("20 millis")
      expect(target.querySelector("button")).toBe(sent)
      expect(target.querySelectorAll("header").length).toBe(1)

      yield* Effect.sync(() => fireEvent.click(target.querySelector("button") ?? target))
      yield* Testing.find("menu", "Sort by")
    }),
  )

  it.live("runs its enhancers and its view once: an update writes the one node that changed", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)

      yield* Effect.provideService(Testing.mount(Counted), Calls, calls)

      const output = yield* Testing.find("status", "Counted")
      const button = screen.getByRole("button", { name: "More" })

      yield* Effect.forEach(Array.from({ length: 100 }), () => Effect.sync(() => button.click()), {
        discard: true,
      })
      yield* shows("Counted", "100")

      expect(yield* Ref.get(calls)).toBe(1)
      expect(screen.getByRole("status", { name: "Counted" })).toBe(output)
      expect(screen.getByRole("button", { name: "More" })).toBe(button)
    }).pipe(Effect.provide(Layer.merge(CounterStore.layer([resetAfterDelay]), withTree))),
  )

  it.live(
    "keeps each row's own state by its key in a For, so reordering moves it with the row",
    () =>
      Effect.gen(function* () {
        yield* Testing.mount(Picker)
        yield* Testing.click("button", "tea")
        yield* Testing.find("menu", "tea")
        yield* Testing.click("button", "Flip")
        yield* Testing.find("menu", "tea")

        expect(screen.queryByRole("menu", { name: "fruit" })).toBeNull()

        const tree = yield* UiState.snapshot

        expect(
          tree
            .filter((piece) => piece.name === "open")
            .map((piece) => [piece.path.join(" / "), piece.value]),
        ).toEqual([
          ["Picker / Dropdown[fruit]", false],
          ["Picker / Dropdown[tea]", true],
        ])
      }).pipe(Effect.provide(withTree)),
  )

  it.live("runs an effect for as long as it is mounted, inside a span that names it", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Ticker)
      yield* shows("Ticks", "1")
    }).pipe(Effect.provide(withTree)),
  )

  it("is called Component when nothing named it, and a group of enhancers runs on any props", () => {
    expect(Unnamed.view.displayName).toBe("Component")
    expect(Effect.isEffect(withHover(null))).toBe(true)
  })

  it("is named after its constant, and its view can be drawn on its own", () => {
    expect([ResetCounter.view.displayName, ResetCounter.view.at]).toEqual([
      "ResetCounter",
      expect.stringContaining("composed.tsx"),
    ])
    expect(
      ResetCounter.view({
        count: Reactive.succeed(3),
        refused: Reactive.succeed(""),
        onIncrement: Effect.void,
        onReset: Effect.void,
      }),
    ).toMatchObject({ tag: "section" })
  })

  it.live(
    "adds the props an Effect makes with withEffectProps, typed for the enhancers after it",
    () =>
      Effect.gen(function* () {
        yield* Testing.mount(Dialog)
        yield* Testing.findText("DRAFT")
        yield* Testing.findText("seen")
        yield* Testing.mount(Ten)
        yield* Testing.findText("ten")
        yield* Testing.mount(Numbered)
        yield* Testing.findText("2 second")
        yield* Testing.mount(View.mapProps(() => ({ name: "Ada" }))(Greeter))
        yield* Testing.findText("HELLO ADA")

        expect(Object.keys(Greeter.view.props)).toEqual(["name"])

        yield* Testing.mount(Resettable)
        yield* shows("Name", "Ada")
        yield* Testing.click("button", "Reset")
        yield* shows("Name", "")
        yield* shows("Open", "false")
      }).pipe(Effect.provide(withTree)),
  )

  it("written in JSX outside any component, says so with its code", () => {
    expect(() => Dropdown({ label: "Alone", items: [], onPick: () => Effect.void })).toThrow(
      "SPAR_COMPONENT_OUTSIDE_A_VIEW",
    )
  })

  it.live("is outside any component again once a view and its list have finished drawing", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Toolbar)
      yield* Testing.mount(Tags)
      yield* Testing.findText("two")

      expect(() => Dropdown({ label: "After", items: [], onPick: () => Effect.void })).toThrow(
        "SPAR_COMPONENT_OUTSIDE_A_VIEW",
      )
    }).pipe(Effect.provide(withTree)),
  )
})
