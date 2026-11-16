import { describe, expect, it } from "@effect/vitest"
import { Effect, Queue } from "effect"
import { soon } from "../src/internal/soon.ts"

describe("yielding to the browser", () => {
  it.live("a task runs on a later turn, and a cancelled one never runs", () =>
    Effect.gen(function* () {
      const ran = yield* Queue.unbounded<string>()

      yield* Effect.sync(() => soon(() => Queue.offerUnsafe(ran, "kept")))
      yield* Effect.sync(() => soon(() => Queue.offerUnsafe(ran, "cancelled"))())

      expect(yield* Queue.size(ran)).toBe(0)

      yield* Effect.sleep("20 millis")

      expect(yield* Queue.clear(ran)).toEqual(["kept"])
    }),
  )
})
