import { describe, expect, it } from "vitest"
import { closing, opening, partsOf, replacements } from "../src/internal/parts.ts"

const part = (inside: string) => `${opening}${inside}${closing}`

const page = (header: string, first: string, second: string) =>
  `<div><h1>${header}</h1>${part(`<p>${first}</p>${part(`<i>${second}</i>`)}`)}${part("<b>x</b>")}</div>`

describe("the parts of a page drawn on the server", () => {
  it("are read with the place of each part's opening and closing mark", () => {
    const read = partsOf(page("Shop", "one", "two"))

    expect(read.open).toBe(-1)
    expect(read.html).toBe(page("Shop", "one", "two"))
    expect(read.children.map((child) => [child.open, child.close])).toEqual([
      [0, 1],
      [2, 2],
    ])
    expect(
      read.children[0]?.children.map((child) => [child.open, child.close, child.html]),
    ).toEqual([[1, 0, "<i>two</i>"]])
  })

  it("send again only the innermost part that changed in itself", () => {
    expect(
      replacements(partsOf(page("Shop", "one", "two")), partsOf(page("Shop", "one", "2"))),
    ).toEqual([{ open: 1, close: 0, html: "<i>2</i>" }])
    expect(
      replacements(partsOf(page("Shop", "one", "two")), partsOf(page("Shop", "1", "2"))),
    ).toEqual([{ open: 0, close: 1, html: `<p>1</p>${part("<i>2</i>")}` }])
    expect(
      replacements(partsOf(page("Shop", "one", "two")), partsOf(page("Shop", "one", "two"))),
    ).toEqual([])
  })

  it("send the whole page again when what is outside every part changed, or a part came or went", () => {
    expect(
      replacements(partsOf(page("Shop", "one", "two")), partsOf(page("Shut", "one", "two"))),
    ).toEqual([{ open: -1, close: -1, html: page("Shut", "one", "two") }])
    expect(
      replacements(
        partsOf(`<div>${part("a")}</div>`),
        partsOf(`<div>${part("a")}${part("b")}</div>`),
      ),
    ).toEqual([{ open: -1, close: -1, html: `<div>${part("a")}${part("b")}</div>` }])
  })

  it("keep a closing mark that closes nothing as text", () => {
    expect(partsOf(`a${closing}b`)).toEqual({
      open: -1,
      close: -1,
      html: `a${closing}b`,
      self: `a${closing}b`,
      children: [],
    })
  })
})
