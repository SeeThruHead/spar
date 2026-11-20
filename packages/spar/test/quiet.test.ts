import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, pipe } from "effect"
import { SecureRandom } from "effect/crypto"
import { vi } from "vitest"
import { Reactive, Store, compose } from "spar"
import * as Testing from "spar/testing"
import { LineView, MarkView } from "./units.tsx"

const Line = Schema.Struct({ id: Schema.Int, text: Schema.String })

type Line = typeof Line.Type

const State = Schema.Struct({ count: Schema.Finite, lines: Schema.Array(Line) })

type State = typeof State.Type

const initialState: State = {
  count: 0,
  lines: [
    { id: 1, text: "one" },
    { id: 2, text: "two" },
    { id: 3, text: "three" },
  ],
}

class Page extends Store.Tag<Page>()("test/QuietPage", {
  state: State,
  initialState,
  actions: {
    counted: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    reworded: Store.action(Schema.Int, (state: State, id: number): State => ({
      ...state,
      lines: state.lines.map((line) =>
        line.id === id ? { ...line, text: `${line.text}!` } : line,
      ),
    })),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    lines: Store.selector(Schema.Array(Line), (state: State) => state.lines),
  },
}) {}

const read = vi.fn((line: Line) => line.text)

const Shown = compose(
  Effect.fnUntraced(function* () {
    const page = yield* Page

    return {
      marked: Reactive.map(page.select.count, (count) => count > 5),
      rows: yield* pipe(
        page.select.lines,
        Reactive.mapBy(
          (line: Line) => String(line.id),
          LineView,
          (line) => ({ text: Reactive.map(line, read) }),
        ),
      ),
    }
  }),
)(MarkView)

const layer = Layer.provide(Page.layer(), SecureRandom.layerWebCrypto)

describe("a change touches only what it changed", () => {
  it.live("a binding whose value did not change is not written again, even the first time", () =>
    Effect.gen(function* () {
      const page = yield* Page

      yield* Testing.mount(Shown)
      yield* Testing.findText("three")

      const mark = yield* Testing.findText("mark")
      const toggled = vi.spyOn(mark.classList, "toggle")

      yield* page.commands.counted()
      yield* Testing.eventually(() => expect(toggled).toHaveBeenCalledTimes(0))
      toggled.mockRestore()
    }).pipe(Effect.provide(layer)),
  )

  it.live("changing one row of a list reads that row again and no other", () =>
    Effect.gen(function* () {
      const page = yield* Page

      yield* Testing.mount(Shown)
      yield* Testing.findText("three")
      read.mockClear()

      yield* page.commands.reworded(2)
      yield* Testing.findText("two!")
      expect(read.mock.calls.map(([line]) => line.id)).toEqual([2])

      yield* page.commands.counted()
      yield* page.commands.reworded(3)
      yield* Testing.findText("three!")
      expect(read.mock.calls.map(([line]) => line.id)).toEqual([2, 3])
    }).pipe(Effect.provide(layer)),
  )
})
