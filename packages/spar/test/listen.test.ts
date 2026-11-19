import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { traced } from "../src/internal/listen.ts"

describe("an event's action", () => {
  it("is left alone when there is nothing to do, and is given a span when there is", () => {
    const nothing: ReadonlyArray<Effect.Effect<void>> = []
    const one = Effect.void
    const several = [Effect.void]

    expect(traced("click", nothing, null)).toBe(nothing)
    expect(traced("click", one, null)).not.toBe(one)
    expect(traced("click", several, null)).not.toBe(several)
    expect(Effect.isEffect(traced("click", several, null))).toBe(true)
  })
})
