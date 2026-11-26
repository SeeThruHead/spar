import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Option, Schema } from "effect"
import { UiState, View, compose } from "spar"
import * as Testing from "spar/testing"
import { gridOf, indexIn, monthTitle, movedBy } from "../src/days.ts"
import { Calendar } from "../src/index.ts"
import { CalendarKitView } from "./CalendarKit.tsx"

const Kit = (start: string) =>
  compose(
    Effect.fnUntraced(function* () {
      const day = yield* UiState.make("day", Schema.String, start)

      return {
        day,
        calendar: yield* View.child(Calendar, {
          label: "Due date",
          value: day,
          onChange: (picked) => UiState.set(day, picked),
        }),
      }
    }),
  )(CalendarKitView)

const keyOnFocus = (name: string) =>
  Effect.sync(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: name }))

const focusedDay = () => document.activeElement?.getAttribute("aria-label")

const moved = (key: string) => Option.getOrNull(movedBy(key, "2026-11-26"))

describe("days", () => {
  it("lays a month out in six weeks from the Sunday before its first day", () => {
    const november = gridOf("2026-11")

    expect([november.length, november[0], november[41]]).toEqual([42, "2026-11-01", "2026-12-12"])
    expect(gridOf("2026-12")[0]).toBe("2026-11-29")
    expect(indexIn("2026-11-26")).toBe(25)
    expect(monthTitle("2026-11")).toBe("November 2026")
  })

  it("moves by a day, a week, to the ends of the week, and by a month", () => {
    expect(
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].map(
        moved,
      ),
    ).toEqual([
      "2026-11-25",
      "2026-11-27",
      "2026-11-19",
      "2026-12-03",
      "2026-11-22",
      "2026-11-28",
      "2026-10-26",
      "2026-12-26",
    ])
    expect(moved("Tab")).toBeNull()
  })
})

describe("calendars", () => {
  it.live("one day takes focus, the arrows move it across months, and a press picks it", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit("2026-11-26"))

      const grid = yield* Testing.find("grid", "November 2026")
      const chosen = yield* Testing.find("button", "Thursday, November 26, 2026")

      expect(grid.querySelectorAll("tbody tr").length).toBe(6)
      expect(chosen.getAttribute("tabindex")).toBe("0")
      expect(chosen.parentElement?.getAttribute("aria-selected")).toBe("true")
      expect(
        screen.getByRole("button", { name: "Sunday, November 1, 2026" }).getAttribute("tabindex"),
      ).toBe("-1")
      expect(
        screen.getByRole("button", { name: "Sunday, November 29, 2026" }).className,
      ).not.toContain("spar-day-outside")
      expect(screen.getByRole("button", { name: "Tuesday, December 1, 2026" }).className).toContain(
        "spar-day-outside",
      )

      yield* Effect.sync(() => chosen.focus())
      yield* keyOnFocus("ArrowDown")
      yield* Testing.eventually(() => expect(focusedDay()).toBe("Thursday, December 3, 2026"))
      yield* Testing.find("grid", "December 2026")
      yield* keyOnFocus("x")
      yield* keyOnFocus("Home")
      yield* Testing.eventually(() => expect(focusedDay()).toBe("Sunday, November 29, 2026"))
      yield* Testing.click("button", "Tuesday, December 1, 2026")
      yield* Testing.eventually(() =>
        expect(screen.getByLabelText("Picked day").textContent).toBe("2026-12-01"),
      )
      expect(
        screen
          .getByRole("button", { name: "Tuesday, December 1, 2026" })
          .parentElement?.getAttribute("aria-selected"),
      ).toBe("true")

      yield* Testing.click("button", "Previous month")
      yield* Testing.find("grid", "November 2026")
      yield* Testing.click("button", "Next month")
      yield* Testing.click("button", "Next month")
      yield* Testing.find("grid", "January 2027")
    }),
  )

  it.effect("with nothing picked, it opens on today", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit(""))
      yield* Testing.find("grid", "January 1970")

      expect(
        screen.getByRole("button", { name: "Thursday, January 1, 1970" }).getAttribute("tabindex"),
      ).toBe("0")
    }),
  )
})
