import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Schema } from "effect"
import { Reactive, UiState, View, compose } from "spar"
import * as Testing from "spar/testing"
import { matching, steppedTo } from "../src/Combobox.ts"
import { Combobox, Listbox, Popover, Tooltip } from "../src/index.ts"
import { TextView } from "./KitView.tsx"
import { OverlayKitView } from "./OverlayKit.tsx"

const sizes = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
]

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "mango", label: "Mango" },
  { value: "orange", label: "Orange" },
]

const Kit = compose(
  Effect.fnUntraced(function* () {
    const chosen = yield* UiState.make("chosen", Schema.String, "m")
    const picked = yield* UiState.make("picked", Schema.String, "")

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
      fruit: yield* View.child(Combobox, {
        label: "Fruit",
        name: "fruit",
        choices: fruits,
        value: picked,
        onChange: (value) => UiState.set(picked, value),
      }),
      chosen,
      picked,
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

const optionLabels = () => screen.queryAllByRole("option").map((option) => option.textContent)

const keyOn = (element: HTMLElement, name: string) =>
  Effect.sync(() => fireEvent.keyDown(element, { key: name }))

describe("comboboxes", () => {
  it("narrow the choices by what is typed, and step around the ends", () => {
    expect(matching(fruits, " AN ").map((fruit) => fruit.value)).toEqual([
      "banana",
      "mango",
      "orange",
    ])
    expect(matching(fruits, "").length).toBe(4)
    expect([
      steppedTo("ArrowDown", -1, 3),
      steppedTo("ArrowUp", -1, 3),
      steppedTo("ArrowDown", 2, 3),
      steppedTo("ArrowUp", 0, 3),
      steppedTo("ArrowDown", -1, 0),
      steppedTo("Tab", 1, 3),
    ]).toEqual([0, 2, 0, 2, -1, 1])
  })

  it.live("typing filters the list, the arrows mark an option, and Enter takes it", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const fruit = yield* Testing.find("combobox", "Fruit")

      expect(fruit.getAttribute("aria-expanded")).toBe("false")
      yield* Testing.fill("combobox", "Fruit", "an")

      const list = yield* Testing.find("listbox", "Fruit")

      expect(list.id).toBe(fruit.getAttribute("aria-controls"))
      expect(fruit.getAttribute("aria-expanded")).toBe("true")
      yield* Testing.eventually(() => expect(optionLabels()).toEqual(["Banana", "Mango", "Orange"]))
      expect(fruit.getAttribute("aria-activedescendant")).toBe(
        screen.getByRole("option", { name: "Banana" }).id,
      )

      yield* keyOn(fruit, "ArrowDown")
      yield* Testing.eventually(() =>
        expect(screen.getByRole("option", { name: "Mango" }).getAttribute("aria-selected")).toBe(
          "true",
        ),
      )
      expect(fruit.getAttribute("aria-activedescendant")).toBe(
        screen.getByRole("option", { name: "Mango" }).id,
      )
      expect(document.activeElement).not.toBe(screen.getByRole("option", { name: "Mango" }))

      yield* keyOn(fruit, "x")
      expect(fireEvent.keyDown(fruit, { key: "Enter" })).toBe(false)
      yield* Testing.gone("listbox")

      expect(screen.getByLabelText("Picked fruit").textContent).toBe("mango")
      expect(fruit).toHaveProperty("value", "Mango")
      expect(document.querySelector('input[name="fruit"]')).toHaveProperty("value", "mango")
      expect(fruit.getAttribute("aria-activedescendant")).toBeNull()
    }),
  )

  it.live("a click takes a choice, Escape closes, and nothing matching shows no list", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const fruit = yield* Testing.find("combobox", "Fruit")

      expect(fireEvent.keyDown(fruit, { key: "Enter" })).toBe(true)
      yield* keyOn(fruit, "ArrowUp")
      yield* Testing.eventually(() =>
        expect(screen.getByRole("option", { name: "Orange" }).getAttribute("aria-selected")).toBe(
          "true",
        ),
      )
      expect(fireEvent.keyDown(fruit, { key: "Escape" })).toBe(false)
      yield* Testing.gone("listbox")
      expect(fireEvent.keyDown(fruit, { key: "Escape" })).toBe(true)

      yield* Testing.fill("combobox", "Fruit", "kiwi")
      yield* Effect.sleep("10 millis")
      expect(screen.queryByRole("listbox")).toBeNull()
      expect(fruit.getAttribute("aria-expanded")).toBe("false")
      expect(fireEvent.keyDown(fruit, { key: "Enter" })).toBe(true)

      yield* Testing.fill("combobox", "Fruit", "ap")
      yield* Testing.click("option", "Apple")
      yield* Testing.gone("listbox")

      expect(screen.getByLabelText("Picked fruit").textContent).toBe("apple")
      yield* Testing.eventually(() => expect(document.activeElement).toBe(fruit))
    }),
  )
})
