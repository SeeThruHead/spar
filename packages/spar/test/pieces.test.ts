import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { Dehydrated } from "../src/internal/dehydrated.ts"
import { arrivedEarly, html, script, seededWith } from "../src/internal/pieces.ts"

describe("the state a server sends with its page", () => {
  it("is read only when it has every part, with a whole trace or none", () => {
    const read = Schema.decodeUnknownOption(Dehydrated)
    const whole = { stores: { "shop/A": 1 }, ui: [], trace: { traceId: "t", spanId: "s" } }

    expect(Option.isSome(read(whole))).toBe(true)
    expect(Option.isSome(read({ ...whole, trace: null }))).toBe(true)
    expect(Option.isNone(read({ ...whole, trace: { traceId: "t" } }))).toBe(true)
    expect(Option.isNone(read({ ui: [], trace: null }))).toBe(true)
  })
})

describe("a piece of a page sent in parts", () => {
  it("never closes its script early, whatever its data holds", () => {
    const sent = script({ stores: { "shop/Notes": "</script><script>alert(1)</script>" } })

    expect(sent.match(/<\/script>/g)).toHaveLength(1)
    expect(sent).toContain("\\u003c/script>")
  })

  it("never closes its template early, whatever the drawn page holds", () => {
    const sent = html("#root", "<p></template><script>alert(1)</script></p>")

    expect(sent.match(/<\/template>/g)).toHaveLength(1)
  })

  it("arrived early is kept only when it has the shape of a piece", () => {
    expect(
      arrivedEarly([
        { stores: { "shop/A": 1 } },
        "junk",
        { stores: 5 },
        { stores: { "shop/B": 2 }, done: true },
      ]),
    ).toEqual([{ stores: { "shop/A": 1 } }, { stores: { "shop/B": 2 }, done: true }])
    expect(arrivedEarly(undefined)).toEqual([])
    expect(
      seededWith({ "shop/A": 0, "shop/C": 3 }, [
        { stores: { "shop/A": 1 } },
        { stores: { "shop/A": 2 } },
      ]),
    ).toEqual({ "shop/A": 2, "shop/C": 3 })
  })
})
