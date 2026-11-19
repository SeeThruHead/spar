import { describe, expect, it } from "@effect/vitest"
import { Diagnostics } from "spar"
import { readFileSync } from "node:fs"
import { Schema } from "effect"

const Listed = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      code: Schema.String,
      kind: Schema.String,
      what: Schema.String,
      fix: Schema.String,
    }),
  ),
)

const listed = Schema.decodeSync(Listed)(readFileSync("diagnostics.json", "utf8"))

describe("diagnostics", () => {
  it("every code says what happened and the fix, as the shipped list has it", () => {
    const sparOnes = listed.filter((found) => found.code.startsWith("SPAR_"))

    expect(
      Object.entries(Diagnostics.all).map(([code, found]) => ({
        code,
        kind: found.kind,
        what: found.what,
        fix: found.fix,
      })),
    ).toEqual(sparOnes.map(({ code, kind, what, fix }) => ({ code, kind, what, fix })))
  })

  it("a report is the code and what happened, where, the fix and where to read more", () => {
    expect(Diagnostics.text("SPAR_NO_PAGE_ON_SERVER", { at: "src/Page.ts:3:1" })).toBe(
      [
        "[SPAR_NO_PAGE_ON_SERVER] There is no page on a server.",
        "  at src/Page.ts:3:1",
        "  fix: Do not measure, focus or scroll while rendering on the server. Do it in a handler or after the browser has taken over.",
        '  see: LLMS.md, section "SPAR_NO_PAGE_ON_SERVER"',
      ].join("\n"),
    )
    expect(Diagnostics.text("SPAR_DUPLICATE_KEY", { said: "Rows a and a share a key." })).toBe(
      [
        "[SPAR_DUPLICATE_KEY] Rows a and a share a key.",
        "  fix: Give each row its own key in Reactive.mapBy, for example the row's id and not its index or label.",
        '  see: LLMS.md, section "SPAR_DUPLICATE_KEY"',
      ].join("\n"),
    )
    expect(Diagnostics.brief("SPAR_LATE_ANSWER")).toBe(
      "[SPAR_LATE_ANSWER] This answers an earlier request",
    )
  })
})
