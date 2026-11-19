import { describe, expect, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { App } from "spar"
import { report } from "../src/internal/crash.ts"

describe("a crash report", () => {
  it.effect(
    "says nothing about where when nobody knows, and names the part when one is given",
    () =>
      Effect.gen(function* () {
        const seen = yield* Ref.make<ReadonlyArray<readonly [unknown, App.CrashWhere]>>([])
        const collecting = Effect.provideService(App.CrashReporter, (defect, where) =>
          Ref.update(seen, (all) => [...all, [defect, where] as const]),
        )

        yield* collecting(report("first"))
        yield* collecting(
          report("second", { displayName: "PeopleView", at: "/src/People.tsx:3:1" }),
        )
        expect(yield* Ref.get(seen)).toEqual([
          ["first", { in: [], at: "" }],
          ["second", { in: ["PeopleView"], at: "/src/People.tsx:3:1" }],
        ])
      }),
  )
})
