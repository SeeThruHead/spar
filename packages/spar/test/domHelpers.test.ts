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

  it("a name that only starts or ends like an attribute name is still written as a property", () => {
    const box = document.createElement("div")
    const label = document.createElement("label")

    Dom.setAttribute(box, "className", "wide")
    Dom.setAttribute(label, "htmlFor", "email")
    expect([box.className, box.hasAttribute("className")]).toEqual(["wide", false])
    expect([label.htmlFor, label.hasAttribute("htmlfor")]).toEqual(["email", false])
  })

  it("writing the value a field already holds leaves the caret where the person put it", () => {
    const field = document.body.appendChild(document.createElement("input"))

    Dom.setAttribute(field, "value", "hello")
    field.setSelectionRange(2, 2)
    Dom.setAttribute(field, "value", "hello")
    expect(field.selectionStart).toBe(2)
    Dom.setAttribute(field, "value", "help")
    expect(field.value).toBe("help")
    field.remove()
  })
})

const markedUp = (html: string): HTMLElement => {
  const parent = document.createElement("div")

  Dom.setMarkup(parent, html)

  return parent
}

const shape = (parent: Node): ReadonlyArray<string> =>
  [...parent.childNodes].map((node) =>
    node instanceof Comment ? `<!--${node.data}-->` : (node.textContent ?? ""),
  )

describe("taking over server-drawn nodes", () => {
  it("an element is claimed past the part marks, by its tag in any case, and only by its own tag", () => {
    const parent = markedUp(`<!--${Dom.partStart}--><!--${Dom.partEnd}--><p>hi</p><b>x</b>`)
    const cursor = Dom.cursorIn(parent)

    expect(Dom.claimElement(cursor, "span")).toBeUndefined()
    expect(Dom.claimElement(cursor, "P")?.textContent).toBe("hi")
    expect(Dom.claimElement(cursor, "b")?.textContent).toBe("x")
    expect(shape(parent)).toEqual(["hi", "x"])
  })

  it("text is claimed past the marks and a text break, or made empty where none was drawn", () => {
    const parent = markedUp(`<!--${Dom.partStart}--><!--${Dom.textBreak}-->ready<i>x</i>`)
    const cursor = Dom.cursorIn(parent)

    expect(Dom.claimText(cursor, parent).data).toBe("ready")
    expect(Dom.claimText(cursor, parent).data).toBe("")
    expect(shape(parent)).toEqual(["ready", "", "x"])
  })

  it("a comment is claimed when it is the one asked for, and made where it is missing", () => {
    const parent = markedUp(`<!--${Dom.partEnd}--><!--keep--><i>x</i>`)
    const cursor = Dom.cursorIn(parent)

    expect(Dom.claimComment(cursor, parent, "keep").data).toBe("keep")
    expect(Dom.claimComment(cursor, parent, "new").data).toBe("new")
    expect(shape(parent)).toEqual(["<!--keep-->", "<!--new-->", "x"])
  })
})
