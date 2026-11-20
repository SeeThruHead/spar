import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Schema } from "effect"
import { Reactive, UiState, View, compose } from "spar"
import * as Testing from "spar/testing"
import { Listbox, Popover, Tooltip } from "../src/index.ts"
import { TextView } from "./KitView.tsx"
import { OverlayKitView } from "./OverlayKit.tsx"

const sizes = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
]

const Kit = compose(
  Effect.fnUntraced(function* () {
    const chosen = yield* UiState.make("chosen", Schema.String, "m")

    return {
      remove: yield* Tooltip.make("Removes the project for everyone"),
      archive: yield* Tooltip.make("Hides the project from lists"),
      popover: yield* View.child(Popover, {
        label: "Sharing",
        text: "Share",
        content: TextView({ text: "Anyone with the link can view." }),
      }),
      size: yield* View.child(Listbox, {
        label: "Size",
        name: "size",
        choices: sizes,
        value: chosen,
        onChange: (value) => UiState.set(chosen, value),
      }),
      colour: yield* View.child(Listbox, {
        label: "Colour",
        name: "colour",
        choices: [{ value: "red", label: "Red" }],
        value: Reactive.succeed("unknown"),
        onChange: () => [],
      }),
      chosen,
    }
  }),
)(OverlayKitView)

const focused = (name: string) =>
  Testing.eventually(() =>
    expect([
      document.activeElement?.getAttribute("role"),
      document.activeElement?.textContent,
    ]).toEqual(["option", name]),
  )

const key = (name: string) =>
  Effect.sync(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: name }))

describe("tooltips", () => {
  it.live("a tooltip shows on focus or hover, describes its button, and goes on leave", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const remove = yield* Testing.find("button", "Delete")
      const archive = yield* Testing.find("button", "Archive")

      expect(screen.queryByRole("tooltip")).toBeNull()
      expect(remove.getAttribute("aria-describedby")).not.toBe(
        archive.getAttribute("aria-describedby"),
      )

      yield* Effect.sync(() => fireEvent.focus(remove))

      const tip = yield* Testing.find("tooltip")

      expect(tip.textContent).toBe("Removes the project for everyone")
      expect(tip.id).toBe(remove.getAttribute("aria-describedby"))

      yield* Effect.sync(() => fireEvent.blur(remove))
      yield* Testing.gone("tooltip")
      yield* Effect.sync(() => fireEvent.pointerEnter(archive))

      expect((yield* Testing.find("tooltip")).textContent).toBe("Hides the project from lists")

      yield* Effect.sync(() => fireEvent.pointerLeave(archive))
      yield* Testing.gone("tooltip")
    }),
  )

  it.live("Escape puts a tooltip away and other keys leave it", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const remove = yield* Testing.find("button", "Delete")

      yield* Effect.sync(() => fireEvent.focus(remove))
      yield* Testing.find("tooltip")
      yield* Effect.sync(() => fireEvent.keyDown(remove, { key: "a" }))
      yield* Effect.sleep("10 millis")
      yield* Testing.find("tooltip")
      yield* Effect.sync(() => fireEvent.keyDown(remove, { key: "Escape" }))
      yield* Testing.gone("tooltip")
    }),
  )
})

describe("popovers", () => {
  it.live("a popover opens by its button, takes focus, and gives it back on Escape", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)
      yield* Testing.click("button", "Sharing")

      const share = yield* Testing.find("button", "Sharing")
      const panel = yield* Testing.find("dialog", "Sharing")

      expect(panel.textContent).toBe("Anyone with the link can view.")
      expect(share.getAttribute("aria-expanded")).toBe("true")

      yield* Testing.eventually(() => expect(document.activeElement).toBe(panel))
      yield* key("Escape")
      yield* Testing.gone("dialog")
      yield* Testing.eventually(() => expect(document.activeElement).toBe(share))

      expect(share.getAttribute("aria-expanded")).toBe("false")

      yield* Testing.click("button", "Sharing")
      yield* Testing.find("dialog", "Sharing")
      yield* Testing.click("button", "Sharing")
      yield* Testing.gone("dialog")
    }),
  )
})

describe("listboxes", () => {
  it.live("a listbox opens on its current choice and is driven by arrows, typing and Enter", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const size = yield* Testing.find("combobox", "Size")

      expect(size.textContent).toBe("Medium")
      expect(size.getAttribute("aria-expanded")).toBe("false")
      expect(fireEvent.keyDown(size, { key: "a" })).toBe(true)

      yield* Effect.sleep("10 millis")

      expect(screen.queryByRole("listbox")).toBeNull()
      expect(fireEvent.keyDown(size, { key: "ArrowDown" })).toBe(false)

      expect((yield* Testing.find("listbox", "Size")).id).toBe(size.getAttribute("aria-controls"))

      yield* focused("Medium")

      expect((yield* Testing.find("option", "Medium")).getAttribute("aria-selected")).toBe("true")
      expect((yield* Testing.find("option", "Small")).getAttribute("aria-selected")).toBe("false")
      expect((yield* Testing.find("option", "Small")).getAttribute("tabindex")).toBe("-1")

      yield* key("ArrowDown")
      yield* focused("Large")
      yield* key("Shift")
      yield* key("x")
      yield* Effect.sleep("10 millis")
      yield* focused("Large")
      yield* key("s")
      yield* focused("Small")
      yield* key("m")
      yield* focused("Medium")
      yield* key("s")
      yield* focused("Small")

      expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: "Enter" })).toBe(
        false,
      )

      yield* Testing.gone("listbox")
      yield* Testing.eventually(() => expect(document.activeElement).toBe(size))

      expect(size.textContent).toBe("Small")
      expect(screen.getByLabelText("Chosen size").textContent).toBe("s")
      expect(document.querySelector('input[name="size"]')).toHaveProperty("value", "s")
    }),
  )

  it.live("a choice can be clicked or taken with Space, and Tab closes without choosing", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)
      yield* Testing.click("combobox", "Size")
      yield* Testing.click("option", "Large")
      yield* Testing.gone("listbox")

      expect(screen.getByLabelText("Chosen size").textContent).toBe("l")

      yield* Testing.click("combobox", "Size")
      yield* focused("Large")
      yield* key("ArrowUp")
      yield* focused("Medium")
      yield* key(" ")
      yield* Testing.gone("listbox")

      expect(screen.getByLabelText("Chosen size").textContent).toBe("m")

      yield* Testing.click("combobox", "Size")
      yield* focused("Medium")
      yield* key("Home")
      yield* focused("Small")
      yield* key("Tab")
      yield* Testing.gone("listbox")

      expect(screen.getByLabelText("Chosen size").textContent).toBe("m")
    }),
  )

  it.live("a value that is not one of the choices shows nothing and opens on the first", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const colour = yield* Testing.find("combobox", "Colour")

      expect(colour.textContent).toBe("")

      yield* Effect.sync(() => fireEvent.keyDown(colour, { key: "ArrowUp" }))
      yield* Testing.find("listbox", "Colour")
      yield* focused("Red")
      yield* key("Enter")
      yield* Testing.gone("listbox")
    }),
  )
})
