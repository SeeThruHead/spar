import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Reactive } from "spar"
import { Direct, Observe, Typed, typed } from "../src/internal/reactive.ts"

describe("a value marked as typed by the user", () => {
  it.effect("reads, changes and is watched exactly like the value it marks", () =>
    Effect.gen(function* () {
      const source = Reactive.succeed("draft")
      const marked = typed(source)
      const stop = yield* marked[Observe](
        () => undefined,
        () => undefined,
      )

      stop()

      expect(yield* marked.get).toBe("draft")
      expect(Stream.isStream(marked.changes)).toBe(true)
      expect(marked[Direct]).toBe(source[Direct])
      expect(Reflect.get(marked, Typed)).toBe(true)
    }),
  )
})
