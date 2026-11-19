import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Ref, Schema } from "effect"
import { Reactive, Timeline, View } from "spar"
import * as Testing from "spar/testing"
import { check } from "spar/transform/app"
import { OrdersView } from "./units.tsx"

const recording = (noted: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen]))

const page = (wait: Effect.Effect<void>) =>
  View.connect(() =>
    Effect.as(wait, { status: Reactive.succeed("shown"), count: Reactive.succeed(1) }),
  )(OrdersView)

const rules = (source: string): ReadonlyArray<string> =>
  check("src/Page.ts", source).map((violation) => violation.rule)

const waiting = (call: string): string =>
  `const Page = View.connect(Effect.fnUntraced(function* () {\n  yield* ${call}\n  return {}\n}))(PageView)`

const millisOf = Schema.decodeUnknownSync(Schema.Struct({ millis: Schema.Finite }))

describe("a component that makes everything below it wait", () => {
  it.live("is noted in the log with how long it held its children back", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])

      yield* Testing.mount(page(Effect.sleep("30 millis"))).pipe(
        Effect.provideService(Timeline.Recorder, recording(noted)),
      )
      yield* Testing.findText("shown")

      const [waited] = yield* Ref.get(noted)

      expect([waited?.kind, waited?.name]).toEqual(["waited", "Orders"])
      expect(millisOf(waited?.detail).millis).toBeGreaterThanOrEqual(16)
      expect(JSON.stringify(waited?.detail)).toMatch(
        /"code":"SPAR_COMPONENT_WAITED","in":"[^"]*Orders","at":"[^"]+:\d+:\d+"/,
      )
    }),
  )

  it.live("one that does not wait is not", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])

      yield* Testing.mount(page(Effect.void)).pipe(
        Effect.provideService(Timeline.Recorder, recording(noted)),
      )
      yield* Testing.findText("shown")
      expect(yield* Ref.get(noted)).toEqual([])
    }),
  )

  it("the build refuses a wait written straight into a component's Effect", () => {
    expect(
      [
        `Effect.sleep("1 second")`,
        "Effect.promise(() => load())",
        "Effect.tryPromise(() => load())",
        "Effect.callback((resume) => resume(Effect.void))",
        "Deferred.await(ready)",
        "Fiber.join(running)",
      ].map((call) => rules(waiting(call))),
    ).toEqual(Array.from({ length: 6 }, () => ["no-waiting-in-components"]))
    expect(
      rules(
        `const Page = View.taking({ id: Schema.String }, function* ({ id }) {\n  yield* Effect.sleep("1 second")\n  return { id }\n})(PageView)`,
      ),
    ).toEqual(["no-waiting-in-components"])
    expect(check("src/Page.ts", waiting(`Effect.sleep("1 second")`))[0]?.message).toContain(
      "TheQuery.ask",
    )
  })

  it("and lets through a wait in a handler, in a store, or anywhere outside a component", () => {
    expect(
      rules(
        [
          `const Page = View.connect(Effect.fnUntraced(function* () {`,
          `  const store = yield* PageStore`,
          `  const orders = yield* OrdersQuery.ask(1)`,
          `  return { onSave: Effect.fnUntraced(function* () { yield* Effect.sleep("1 second") }) }`,
          `}))(PageView)`,
          `const later = Effect.gen(function* () { yield* Effect.sleep("1 second") })`,
          `const reset = Store.after(action, function* () { yield* Deferred.await(ready) })`,
          `const made = View.make("X", {}, () => null)`,
        ].join("\n"),
      ),
    ).toEqual([])
  })
})
