import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { App } from "spar"
import * as Testing from "spar/testing"
import { Counter } from "../../../apps/demo/src/counter/Counter.tsx"
import { CounterStore } from "../../../apps/demo/src/counter/CounterStore.ts"

export const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Counter, {
    target,
    layer: CounterStore.layer,
  })
})

export const theCounterCounts = Effect.gen(function* () {
  yield* Testing.mount(Counter)
  yield* Testing.click("button", "Add one")

  const count = yield* Testing.find("status", "Count")

  yield* Testing.eventually(() => expect(count.textContent).toBe("1"))
}).pipe(Effect.provide(CounterStore.layer))

const withRoot = Effect.acquireRelease(
  Effect.sync(() => document.body.insertAdjacentHTML("beforeend", '<div id="root"></div>')),
  () => Effect.sync(() => document.getElementById("root")?.remove()),
)

describe("Getting started, as written in the docs", () => {
  it.live("the counter counts", () => theCounterCounts)

  it.live("the mount program draws the counter into #root", () =>
    Effect.gen(function* () {
      yield* withRoot
      yield* Effect.forkScoped(program, { startImmediately: true })
      yield* Testing.find("button", "Add one")
    }).pipe(Effect.scoped),
  )
})
