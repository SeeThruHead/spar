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

describe("where a view was made, read from a stack", () => {
  it("is the file, line and column of the caller, whichever browser wrote the stack", () => {
    const chromium = [
      "Error: where this view was made",
      "    at Module.make (http://localhost:5173/@fs/repo/packages/spar/src/View.ts:88:9)",
      "    at http://localhost:5173/src/PeopleView.tsx?t=1700000000000:12:27",
      "    at ModuleJob.run (node:internal/modules/esm/module_job:1:1)",
    ].join("\n")
    const firefox = [
      "make@http://localhost:5173/@fs/repo/packages/spar/src/View.ts:88:9",
      "@http://localhost:5173/src/PeopleView.tsx:12:27",
    ].join("\n")

    expect(Diagnostics.locationIn(chromium, 1)).toBe("/src/PeopleView.tsx:12:27")
    expect(Diagnostics.locationIn(firefox, 1)).toBe("/src/PeopleView.tsx:12:27")
    expect(Diagnostics.locationIn("    at make (/repo/src/View.ts:1:2)", 0)).toBe(
      "/repo/src/View.ts:1:2",
    )
    expect(Diagnostics.locationIn("    at make (/repo/src/View.ts:1:2)   ", 0)).toBe(
      "/repo/src/View.ts:1:2",
    )
    expect(Diagnostics.locationIn("/repo/src/View.ts:1:2 is named here, not a frame", 0)).toBe("")
    expect(Diagnostics.locationIn(chromium, 9)).toBe("")
    expect(Diagnostics.locationIn(undefined, 0)).toBe("")
  })
})

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
    expect(
      Diagnostics.text("SPAR_PART_CRASHED", { in: ["ShellView", "PeopleView"], at: "" }).split(
        "\n",
      ),
    ).toEqual([
      "[SPAR_PART_CRASHED] A part of the page crashed.",
      "  in ShellView > PeopleView",
      "  fix: Read the defect that follows. If the part is wrapped in View.crash the rest of the page kept working; fix the cause in the component the report names.",
      '  see: LLMS.md, section "SPAR_PART_CRASHED"',
    ])
    expect(Diagnostics.text("SPAR_PART_CRASHED", { in: [] }).split("\n")).toHaveLength(3)
    expect(Diagnostics.brief("SPAR_LATE_ANSWER")).toBe(
      "[SPAR_LATE_ANSWER] This answers an earlier request",
    )
  })
})
