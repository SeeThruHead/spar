import { describe, expect, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Layer, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Query, Reactive, State, compose, withProps } from "spar"
import * as Testing from "spar/testing"
import { CounterStore, ResetCounter } from "./besideEffectUi.test.tsx"
import { valueIn } from "./results.ts"

class Greetings extends Context.Service<
  Greetings,
  { readonly greet: (name: string) => Effect.Effect<string> }
>()("test/Greetings") {}

class Greeting extends Query.Tag<Greeting>()("test/Greeting", {
  input: Schema.String,
  success: Schema.String,
  failure: Schema.Never,
  load: (name: string) => Effect.flatMap(Greetings, (greetings) => greetings.greet(name)),
}) {}

const Greeted = compose(
  withProps({}),
  Effect.fnUntraced(function* () {
    const greeting = yield* Greeting.ask("Ada")

    return {
      said: Reactive.map(greeting.result, (result) => valueIn(result) ?? "waiting"),
    }
  }),
)((props) => (
  <section aria-label="Greeting">
    <p>{props.said}</p>
    <input aria-label="Name" />
  </section>
))

const slowly = Layer.succeed(Greetings, {
  greet: (name) => Effect.as(Effect.sleep(Duration.seconds(1)), `Hello, ${name}`),
})

const Restless = compose(
  withProps({}),
  Effect.fnUntraced(function* () {
    const ticking = Stream.mapEffect(
      Stream.iterate(1, (tick) => tick + 1),
      (tick) => Effect.as(Effect.yieldNow, tick),
    )

    return { ticks: yield* Reactive.fromStream(0, ticking) }
  }),
)((props) => <p>{props.ticks}</p>)

describe("a Play test", () => {
  it.effect("runs the store's real task on the test clock, with no browser", () =>
    Effect.gen(function* () {
      const play = yield* Testing.play(ResetCounter)

      yield* play.click("button", "Add 1")
      expect((yield* play.find("status", "Count")).textContent).toBe("1")

      yield* play.click("button", "Reset after a delay")
      yield* play.click("button", "Add 1")
      expect(yield* play.has("1")).toBe(true)

      yield* TestClock.adjust(Duration.seconds(2))
      expect((yield* play.find("status", "Count")).textContent).toBe("0")
    }).pipe(
      Effect.scoped,
      Effect.provide(CounterStore.layer.pipe(Layer.provideMerge(State.layer))),
    ),
  )

  it.effect("loads a real query from the test's layer when the clock gets there", () =>
    Effect.gen(function* () {
      const play = yield* Testing.play(Greeted)

      expect(yield* play.has("waiting")).toBe(true)

      yield* TestClock.adjust(Duration.seconds(1))
      expect(yield* play.has("Hello, Ada")).toBe(true)

      yield* play.type("textbox", "Name", "Grace")
      yield* play.press("Enter")
      expect(Reflect.get(yield* play.find("textbox", "Name"), "value")).toBe("Grace")

      const missing = yield* Effect.exit(play.click("button", "Send"))
      const noDialog = yield* Effect.exit(play.find("dialog"))

      expect(Exit.isFailure(missing) && String(missing.cause)).toContain('a button named "Send"')
      expect(Exit.isFailure(noDialog) && String(noDialog.cause)).toContain("a dialog on the page")
      expect((yield* play.find("textbox")).getAttribute("aria-label")).toBe("Name")
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Greeting.live.pipe(
          Layer.provideMerge(slowly),
          Layer.provideMerge(SecureRandom.layerWebCrypto),
          Layer.provideMerge(State.layer),
        ),
      ),
    ),
  )

  it.effect("fails with a typed error when the page never stops changing", () =>
    Effect.gen(function* () {
      const play = yield* Effect.exit(Testing.play(Restless))

      expect(Exit.isFailure(play) && String(play.cause)).toContain("never settled")
    }).pipe(Effect.scoped),
  )
})
