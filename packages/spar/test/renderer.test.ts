import { describe, expect, it, vi } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Cause, Effect, Exit, Layer, Queue, SubscriptionRef, pipe } from "effect"
import { App, Reactive, View } from "spar"
import { BadgeView, GlossaryView, IconView, PairView, RowsView } from "./graphics.tsx"
import { eventually, find, findText, mount } from "spar/testing"
import { ItemView } from "./views.tsx"
import type { Item } from "./views.tsx"
import type { Mountable } from "../src/View.ts"

const items = (labels: ReadonlyArray<string>): ReadonlyArray<Item> =>
  labels.map((label) => ({ id: label.toLowerCase(), label }))

const Listed = (
  list: Reactive.Reactive<ReadonlyArray<Item>>,
  row: Mountable<{ readonly item: Reactive.Reactive<Item> }>,
  frame: View.View<{ readonly rows: import("spar").Element }>,
) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const rows = yield* pipe(
        list,
        Reactive.mapBy(
          (item: Item) => item.id,
          row,
          (item) => ({ item }),
        ),
      )

      return { rows }
    }),
  )(frame)

const textsOf = (role: string): ReadonlyArray<string | null> =>
  screen.getAllByRole(role).map((node) => node.textContent)

const insertionsInto = Effect.fnUntraced(function* (list: HTMLElement) {
  const inserted = yield* Queue.unbounded<number>()

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const observer = new MutationObserver((records) =>
        records.forEach((record) => Queue.offerUnsafe(inserted, record.addedNodes.length)),
      )
      observer.observe(list, { childList: true })

      return observer
    }),
    (observer) => Effect.sync(() => observer.disconnect()),
  )

  return inserted
})

const total = (inserted: Queue.Queue<number>) =>
  Effect.map(Queue.clear(inserted), (counts) => counts.reduce((sum, count) => sum + count, 0))

describe("the renderer", () => {
  it.live("class and style records, ARIA and data attributes follow their reactive values", () =>
    Effect.gen(function* () {
      const active = yield* SubscriptionRef.make(false)
      const tone = yield* SubscriptionRef.make<string | null>("red")

      yield* mount(
        pipe(
          BadgeView,
          View.mapProps(() => ({
            active: Reactive.fromSubscriptionRef(active),
            tone: Reactive.fromSubscriptionRef(tone),
            label: "Flag",
          })),
        ),
      )

      const badge = yield* find("button", "Flag")

      expect([...badge.classList]).toEqual(["badge"])
      expect(badge.style.color).toBe("red")
      expect(badge.style.fontWeight).toBe("bold")
      expect(badge.style.getPropertyValue("--gap")).toBe("4")
      expect(badge.getAttribute("aria-pressed")).toBe("false")
      expect(badge.hasAttribute("data-selected")).toBe(false)
      expect(badge.getAttribute("data-kind")).toBe("badge")
      expect(badge.getAttribute("data-tone")).toBe("red")
      expect(badge.title).toBe("Flag")
      expect(badge.firstElementChild?.getAttribute("class")).toBe("badge-label")

      yield* SubscriptionRef.set(active, true)
      yield* SubscriptionRef.set(tone, null)
      yield* eventually(() => expect(badge.getAttribute("aria-pressed")).toBe("true"))
      yield* eventually(() => expect(badge.style.color).toBe(""))

      expect([...badge.classList]).toEqual(["badge", "is-active", "is-loud"])
      expect(badge.getAttribute("data-selected")).toBe("")
      expect(badge.hasAttribute("data-tone")).toBe(false)
    }),
  )

  it.live("SVG is created in the SVG namespace and foreignObject content in HTML", () =>
    Effect.gen(function* () {
      const size = yield* SubscriptionRef.make(16)

      yield* mount(
        pipe(
          IconView,
          View.mapProps(() => ({ size: Reactive.fromSubscriptionRef(size) })),
        ),
      )

      const icon = yield* find("img", "Dot")
      const circle = icon.querySelector("circle")
      const paragraph = screen.getByText("Inside the drawing")

      expect(icon.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(circle?.getAttribute("class")).toBe("dot")
      expect(paragraph.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
      expect(icon.getAttribute("width")).toBe("16")

      yield* SubscriptionRef.set(size, 24)
      yield* eventually(() => expect(icon.getAttribute("width")).toBe("24"))
    }),
  )

  it.live("rows made of several nodes move, join and leave as one", () =>
    Effect.gen(function* () {
      const list = yield* SubscriptionRef.make(items(["Alpha", "Beta", "Gamma"]))

      yield* mount(Listed(Reactive.fromSubscriptionRef(list), PairView, GlossaryView))
      yield* findText("alpha")

      const [alpha] = screen.getAllByRole("term")

      yield* SubscriptionRef.set(list, items(["Gamma", "Delta", "Alpha"]))
      yield* eventually(() => expect(textsOf("definition")).toEqual(["Gamma", "Delta", "Alpha"]))

      expect(textsOf("term")).toEqual(["gamma", "delta", "alpha"])
      expect(screen.getAllByRole("term").at(-1)).toBe(alpha)
    }),
  )

  it.live("swapping two rows of a long list moves only those two", () =>
    Effect.gen(function* () {
      const labels = Array.from({ length: 200 }, (_, index) => `Row ${index}`)
      const swapped = labels.with(3, "Row 150").with(150, "Row 3")
      const list = yield* SubscriptionRef.make(items(labels))

      yield* mount(Listed(Reactive.fromSubscriptionRef(list), ItemView, RowsView))

      const rows = yield* find("list", "Rows")
      const insertions = yield* insertionsInto(rows)

      yield* SubscriptionRef.set(list, items(swapped))
      yield* eventually(() => expect(textsOf("listitem")).toEqual(swapped))
      yield* Effect.sleep("20 millis")

      expect(yield* total(insertions)).toBe(2)
    }),
  )

  it.live("where the browser can move a node without resetting it, rows are moved that way", () =>
    Effect.gen(function* () {
      const moved = vi.fn(function (this: Node, node: Node, before: Node | null) {
        this.insertBefore(node, before)
      })
      const list = yield* SubscriptionRef.make(items(["One", "Two", "Three"]))

      Reflect.defineProperty(Element.prototype, "moveBefore", { configurable: true, value: moved })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => Reflect.deleteProperty(Element.prototype, "moveBefore")),
      )
      yield* mount(Listed(Reactive.fromSubscriptionRef(list), ItemView, RowsView))
      yield* find("list", "Rows")
      yield* SubscriptionRef.set(list, items(["Three", "One", "Two"]))
      yield* eventually(() => expect(textsOf("listitem")).toEqual(["Three", "One", "Two"]))

      expect(moved.mock.calls.map(([node]) => node.textContent)).toEqual(["Three"])

      moved.mockImplementation(() => {
        throw new DOMException("cannot keep state here", "HierarchyRequestError")
      })
      yield* SubscriptionRef.set(list, items(["Two", "Three", "One"]))
      yield* eventually(() => expect(textsOf("listitem")).toEqual(["Two", "Three", "One"]))
    }),
  )

  it.live("a list with a repeated key stops with an error naming the key", () =>
    Effect.gen(function* () {
      const list = Reactive.succeed(items(["Alpha", "Beta", "Alpha"]))
      const target = document.createElement("div")
      const exit = yield* Effect.exit(
        App.mount(Listed(list, ItemView, RowsView), { target, layer: Layer.empty }),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(Cause.pretty(Exit.isFailure(exit) ? exit.cause : Cause.empty)).toContain(
        "rows that share a key: alpha. Each row needs its own key.",
      )
    }),
  )
})
