import { describe, expect, it } from "@effect/vitest"
import * as Dom from "../src/internal/dom.ts"

const boxed = (id: number, box: Readonly<Record<"left" | "top" | "right" | "bottom", number>>) => {
  const node = document.body.appendChild(document.createElement("div"))

  node.setAttribute("data-box-test", String(id))
  Object.defineProperty(node, "getBoundingClientRect", { value: () => box })

  return node
}

describe("small DOM helpers", () => {
  it("the box around several marked nodes is the smallest that holds them all", () => {
    const nodes = [
      boxed(7, { left: 30, top: 50, right: 90, bottom: 70 }),
      boxed(7, { left: 10, top: 60, right: 40, bottom: 120 }),
      boxed(8, { left: 0, top: 0, right: 500, bottom: 500 }),
    ]

    Object.defineProperty(window, "scrollX", { value: 5, configurable: true })
    Object.defineProperty(window, "scrollY", { value: 100, configurable: true })
    expect(Dom.boxAround("data-box-test", 7)).toEqual({ x: 15, y: 150, width: 80, height: 70 })
    expect(Dom.boxAround("data-box-test", 9)).toBeNull()
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true })
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true })
    nodes.forEach((node) => node.remove())
  })

  it("a class list given as words is switched word by word, whatever the spacing", () => {
    const node = document.createElement("p")

    Dom.toggleClass(node, "  big   red\tbold ", true)
    expect([...node.classList]).toEqual(["big", "red", "bold"])
    Dom.toggleClass(node, "red", false)
    Dom.toggleClass(node, "big", "yes")
    expect([...node.classList]).toEqual(["bold"])
  })

  it("a style name in camel case is written with dashes, and a custom property is left alone", () => {
    expect(Dom.cssName("backgroundColor")).toBe("background-color")
    expect(Dom.cssName("--mainColor")).toBe("--mainColor")
    expect(Dom.cssName("-webkitLineClamp")).toBe("-webkit-line-clamp")
  })
})
