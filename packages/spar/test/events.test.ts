import { describe, expect, it } from "@effect/vitest"
import { vi } from "vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Predicate, Schedule, Stream, SubscriptionRef, pipe } from "effect"
import { TestClock } from "effect/testing"
import { Events, Reactive, UiState, View } from "spar"
import { MenuItemsView, MenuView, SearchView, StatusView } from "./menus.tsx"
import { eventually, find, gone, mount } from "spar/testing"

const yesNo = (value: boolean): string => (value ? "yes" : "no")

const text = (label: string) => screen.getByLabelText(label).textContent

const narrowTo = (width: number) =>
  Effect.sync(() => {
    const controls: unknown = Reflect.get(window, "happyDOM")
    if (!Predicate.hasProperty(controls, "setViewport")) return
    if (!Predicate.isFunction(controls.setViewport)) return

    Reflect.apply(controls.setViewport, controls, [{ width, height: 800 }])
  })

const Menu = View.connect(
  Effect.fnUntraced(function* () {
    const open = yield* UiState.make(false)

    yield* Events.onDocument("pointerdown", UiState.set(open, false))
    yield* Events.onWindow("keydown", (event) =>
      event.key === "Escape" ? UiState.set(open, false) : [],
    )

    return { open, menu: yield* pipe(open, Reactive.when(MenuItemsView, {})) }
  }),
)(MenuView)

const Search = View.connect(
  Effect.fnUntraced(function* () {
    const searches = yield* SubscriptionRef.make(0)

    return {
      searches: Reactive.fromSubscriptionRef(searches),
      onSearch: SubscriptionRef.update(searches, (count) => count + 1),
    }
  }),
)(SearchView)

const Status = View.connect(
  Effect.fnUntraced(function* () {
    const online = yield* Events.online
    const visible = yield* Events.visible
    const wide = yield* Events.mediaQuery("(min-width: 600px)")
    const resized = yield* Reactive.fromStream(false, Stream.as(Events.fromWindow("resize"), true))
    const keys = yield* Reactive.fromStream(
      "",
      Events.fromDocument("keydown").pipe(
        Stream.scan(
          () => "",
          (typed, event) => typed + event.key,
        ),
      ),
    )
    const ticks = yield* Reactive.fromStream(
      0,
      Stream.fromSchedule(Schedule.spaced("1 second")).pipe(Stream.map((count) => count + 1)),
    )

    return {
      online: Reactive.map(online, yesNo),
      visible: Reactive.map(visible, yesNo),
      wide: Reactive.map(wide, yesNo),
      resized: Reactive.map(resized, yesNo),
      keys,
      ticks,
    }
  }),
)(StatusView)

const open = Effect.gen(function* () {
  const button = yield* find("button", "Options")

  yield* Effect.sync(() => fireEvent.click(button))
  yield* find("menu", "Options")

  return button
})

describe("events beyond one element", () => {
  it.live(
    "a menu closes on Escape and on a press outside it, and stays open on a press inside",
    () =>
      Effect.gen(function* () {
        yield* mount(Menu)

        const button = yield* open
        const menu = yield* find("menu", "Options")

        yield* Effect.sync(() => fireEvent.pointerDown(menu))
        yield* Effect.sync(() => fireEvent.keyDown(window, { key: "a" }))
        yield* Effect.yieldNow

        expect(screen.queryByRole("menu")).toBe(menu)

        yield* Effect.sync(() => fireEvent.keyDown(window, { key: "Escape" }))
        yield* gone("menu")

        expect(button.getAttribute("aria-expanded")).toBe("false")

        yield* open
        yield* Effect.sync(() => fireEvent.pointerDown(document.body))
        yield* gone("menu")
      }),
  )

  it.live("a prevented submit runs its action and does not reach the browser's default", () =>
    Effect.gen(function* () {
      yield* mount(Search)

      const form = yield* find("form", "Search")
      const allowed = yield* Effect.sync(() => fireEvent.submit(form))

      expect(allowed).toBe(false)
      yield* eventually(() => expect(screen.getByLabelText("Searches").textContent).toBe("1"))
    }),
  )

  it.effect("online, visibility, media queries, keys and timers arrive as reactive values", () =>
    Effect.gen(function* () {
      const matchMedia = vi.spyOn(window, "matchMedia")

      yield* mount(Status)

      expect([text("Online"), text("Visible"), text("Wide")]).toEqual(["yes", "yes", "yes"])

      yield* narrowTo(400)
      yield* Effect.sync(() =>
        matchMedia.mock.results.forEach((result) =>
          result.value.dispatchEvent(new Event("change")),
        ),
      )
      yield* Effect.sync(() => document.dispatchEvent(new Event("visibilitychange")))
      yield* Effect.sync(() => window.dispatchEvent(new Event("offline")))
      yield* Effect.sync(() => fireEvent.keyDown(document, { key: "o" }))
      yield* Effect.sync(() => fireEvent.keyDown(document, { key: "k" }))
      yield* TestClock.adjust("3 seconds")

      expect([text("Online"), text("Keys"), text("Ticks")]).toEqual(["no", "ok", "3"])
      expect(text("Resized")).toBe("yes")
      yield* eventually(() => expect([text("Wide"), text("Visible")]).toEqual(["no", "yes"]))

      yield* Effect.sync(() => window.dispatchEvent(new Event("online")))
      yield* TestClock.adjust("1 second")

      expect(text("Online")).toBe("yes")
    }),
  )
})
