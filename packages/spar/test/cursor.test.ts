import { describe, expect, it } from "@effect/vitest"
import * as Dom from "../src/internal/dom.ts"

const holding = (html: string): HTMLElement => {
  const parent = document.createElement("div")

  parent.insertAdjacentHTML("beforeend", html)

  return parent
}

describe("claiming what a server sent", () => {
  it("a list's end is found past the lists inside it", () => {
    const parent = holding("<!--[--><!--[--><b></b><!--]--><u></u><!--]--><i></i>")
    const cursor = Dom.cursorIn(parent)
    const outer = Dom.claimList(cursor, parent)

    expect(outer.anchor.nextSibling?.nodeName).toBe("I")
    expect(cursor.next?.nodeName).toBe("I")

    const inner = Dom.claimList(outer.rows, parent)

    expect(inner.rows.next?.nodeName).toBe("B")
    expect(inner.anchor.nextSibling?.nodeName).toBe("U")
    expect(parent.innerHTML).toBe("<b></b><!----><u></u><!----><i></i>")
  })

  it("a list whose end never comes is started afresh where it stands", () => {
    const parent = holding("<!--[--><b></b>")
    const cursor = Dom.cursorIn(parent)
    const list = Dom.claimList(cursor, parent)

    expect(list.rows.next).toBe(list.anchor)
    expect(parent.firstChild).toBe(list.anchor)

    Dom.dropRest(cursor, null)

    expect(parent.innerHTML).toBe("<!---->")
  })
})
