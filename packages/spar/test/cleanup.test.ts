import { describe, expect, it, vi } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Exit, Scope, Stream, SubscriptionRef, pipe } from "effect"
import { Events, Reactive, UiState, View } from "spar"
import * as Testing from "spar/testing"
import { ListView, RowView } from "./cleanup.tsx"
import type { Item } from "./cleanup.tsx"

const List = (
  items: SubscriptionRef.SubscriptionRef<ReadonlyArray<Item>>,
  shared: SubscriptionRef.SubscriptionRef<string>,
) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const marked = yield* UiState.make(false)
      const picks = yield* UiState.make(0)
      const sharedNow = Reactive.fromSubscriptionRef(shared)

      yield* Reactive.fromStream(false, Stream.as(Events.fromWindow("resize"), true))
      yield* Reactive.fromStream(false, Stream.as(Events.fromDocument("keyup"), true))
      yield* Events.onWindow("keydown", [])
      yield* Events.onDocument("pointerdown", [])
      yield* Events.online

      return {
        shared: sharedNow,
        picks,
        onMark: UiState.set(marked, true),
        rows: yield* pipe(
          Reactive.fromSubscriptionRef(items),
          Reactive.mapBy(
            (item: Item) => item.id,
            RowView,
            (item) => ({
              item,
              shared: sharedNow,
              marked,
              onPick: UiState.update(picks, (count) => count + 1),
            }),
          ),
        ),
      }
    }),
  )(ListView)

const started = Effect.gen(function* () {
  const items = yield* SubscriptionRef.make<ReadonlyArray<Item>>([
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ])
  const shared = yield* SubscriptionRef.make("first")
  const scope = yield* Scope.make()

  yield* Scope.provide(Testing.mount(List(items, shared)), scope)
  yield* Testing.findText("Alpha")

  return { items, shared, unmount: Scope.close(scope, Exit.void) }
})

const rowOf = (label: string): HTMLElement => {
  const row = screen.getByText(label).closest("li")
  if (row === null) throw new Error(`no row for ${label}`)

  return row
}

const pairs = (calls: ReadonlyArray<ReadonlyArray<unknown>>) =>
  calls.map(([type, listener]) => ({ type, listener }))

const balance = (target: EventTarget) => {
  const added = vi.spyOn(target, "addEventListener")
  const removed = vi.spyOn(target, "removeEventListener")
  return {
    added: () => pairs(added.mock.calls),
    removed: () => pairs(removed.mock.calls),
    restore: () => {
      added.mockRestore()
      removed.mockRestore()
    },
  }
}

describe("what a part of the page took is given back", () => {
  it.live("a removed row stops listening and stops following what it showed", () =>
    Effect.gen(function* () {
      const { items, shared, unmount } = yield* started
      const row = rowOf("Alpha")
      const button = row.querySelector("button")
      const clicks = balance(button ?? row)

      yield* SubscriptionRef.update(items, (all) => all.filter((item) => item.id !== "a"))
      yield* Testing.eventually(() => expect(screen.queryByText("Alpha")).toBeNull())
      yield* SubscriptionRef.set(shared, "second")
      yield* Testing.click("button", "Mark")
      yield* Testing.eventually(() =>
        expect(screen.getByLabelText("Shared").textContent).toBe("second"),
      )
      yield* Testing.eventually(() => expect(rowOf("Beta").className).toBe("marked"))

      expect(row.querySelector("em")?.textContent).toBe("first")
      expect(row.className).toBe("")
      expect(clicks.removed().map((call) => call.type)).toEqual(["click"])

      yield* unmount
      clicks.restore()
    }),
  )

  it.live("an unmounted app leaves no nodes, listeners or followers behind", () =>
    Effect.gen(function* () {
      const onWindow = balance(window)
      const onDocument = balance(document)
      const { shared, unmount } = yield* started
      const section = screen.getByRole("region", { name: "Things" })
      const line = screen.getByLabelText("Shared")
      const mark = balance(screen.getByRole("button", { name: "Mark" }))
      const pick = rowOf("Beta").querySelector("button")
      const holder = section.parentElement

      expect(document.querySelector("[data-spar-overlays]")).not.toBeNull()
      expect(new Set(onWindow.added().map((call) => call.type))).toEqual(
        new Set(["keydown", "offline", "online", "resize"]),
      )

      yield* unmount
      yield* SubscriptionRef.set(shared, "after the end")
      yield* Effect.sleep("10 millis")
      fireEvent.click(pick ?? section)

      expect(line.textContent).toBe("first")
      expect(section.parentElement).toBeNull()
      expect(holder?.isConnected).toBe(false)
      expect(document.querySelector("[data-spar-overlays]")).toBeNull()
      expect(mark.removed().map((call) => call.type)).toEqual(["click"])
      expect(onWindow.removed()).toEqual(expect.arrayContaining(onWindow.added()))
      expect(onDocument.removed()).toEqual(expect.arrayContaining(onDocument.added()))
      expect(new Set(onDocument.added().map((call) => call.type))).toEqual(
        new Set(["pointerdown", "keyup"]),
      )
      expect(screen.queryByLabelText("Picks")).toBeNull()

      mark.restore()
      onWindow.restore()
      onDocument.restore()
    }),
  )
})
