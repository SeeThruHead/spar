import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { State as OneState, Store, compose, withStore } from "spar"
import * as Testing from "spar/testing"

const Counting = Schema.Struct({ count: Schema.Int })

type Counting = typeof Counting.Type

export class CounterStore extends Store.Tag<CounterStore>()("beside/ResetCounter", {
  state: Counting,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Void, (state: Counting): Counting => ({ count: state.count + 1 })),
  },
  selectors: { count: Store.selector(Schema.Int, (state: Counting) => state.count) },
  tasks: {
    reset: Store.task(Schema.Void, {
      result: Schema.Void,
      run: () => Effect.sleep(Duration.seconds(2)),
      finish: (): Counting => ({ count: 0 }),
      mode: "switch",
      refuses: ["added", "reset"],
    }),
  },
}) {}

export const ResetCounter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    resetting: store.running.reset,
    onAdd: store.commands.added(),
    onReset: store.tasks.reset(),
  })),
)((props) => (
  <section aria-label="Counter">
    <output aria-label="Count">{props.count}</output>
    <button onClick={props.onAdd}>Add 1</button>
    <button onClick={props.onReset} disabled={props.resetting}>
      Reset after a delay
    </button>
  </section>
))

describe("the reset counter on the page beside Effect UI", () => {
  it.effect("refuses Add 1 and a second reset while the reset runs, then counts from 0", () =>
    Effect.gen(function* () {
      const counter = yield* CounterStore

      yield* counter.commands.added()
      yield* counter.tasks.reset()
      yield* counter.commands.added()
      yield* counter.tasks.reset()

      expect(yield* counter.select.count.get).toBe(1)

      yield* TestClock.adjust(Duration.seconds(2))

      expect(yield* counter.select.count.get).toBe(0)
    }).pipe(Effect.provide(CounterStore.layer.pipe(Layer.provideMerge(OneState.layer)))),
  )

  it.live("draws the count and adds 1 on a click", () =>
    Effect.gen(function* () {
      yield* Testing.mount(ResetCounter)
      yield* Testing.click("button", "Add 1")

      const count = yield* Testing.find("status", "Count")

      yield* Testing.eventually(() => expect(count.textContent).toBe("1"))
    }).pipe(Effect.provide(CounterStore.layer)),
  )
})
