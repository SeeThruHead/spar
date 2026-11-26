import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { UiState, compose, withHandlers, withUiState } from "spar"
import type { Action } from "spar"
import * as Testing from "spar/testing"

const Picker = compose(
  withUiState("highlighted", Schema.String, "beta"),
  withUiState("chosen", Schema.String, "nothing"),
  withUiState("picks", Schema.Int, 0),
  withHandlers(
    (props: {
      readonly highlighted: UiState.UiState<string>
      readonly chosen: UiState.UiState<string>
      readonly picks: UiState.UiState<number>
    }) => {
      const pick = (name: string): Action => [
        UiState.set(props.chosen, name),
        UiState.update(props.picks, (picks) => picks + 1),
      ]

      return {
        onPick: Effect.gen(function* () {
          const name = yield* props.highlighted.get

          return pick(name)
        }),
        onSkip: Effect.gen(function* () {
          const name = yield* props.highlighted.get

          if (name === "beta") return

          return pick(name)
        }),
        onClear: Effect.succeed(UiState.set(props.chosen, "cleared")),
        onTen: Effect.succeed(
          Effect.gen(function* () {
            yield* UiState.update(props.picks, (picks) => picks + 5)
            yield* UiState.update(props.picks, (picks) => picks + 5)
          }),
        ),
      }
    },
  ),
)((props) => (
  <section>
    <button onClick={props.onPick}>Pick</button>
    <button onClick={props.onSkip}>Skip beta</button>
    <button onClick={props.onClear}>Clear</button>
    <button onClick={props.onTen}>Ten more</button>
    <output>
      Chose {props.chosen}, {props.picks} picks
    </output>
  </section>
))

const Saver = compose(
  withUiState("saves", Schema.Int, 0),
  withUiState("taps", Schema.Int, 0),
  withHandlers(
    (props: {
      readonly saves: UiState.UiState<number>
      readonly taps: UiState.UiState<number>
    }) => ({
      onSave: Effect.as(
        Effect.sleep("100 millis"),
        UiState.update(props.saves, (saves) => saves + 1),
      ),
      onTap: UiState.update(props.taps, (taps) => taps + 1),
    }),
  ),
)((props) => (
  <section>
    <button onClick={props.onSave}>Save</button>
    <button onClick={props.onTap}>Tap</button>
    <output>
      {props.saves} saves, {props.taps} taps
    </output>
  </section>
))

describe("a second click while the first click's work runs", () => {
  it.live("is dropped, so slow work runs once per press, and quick work counts every click", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Saver)

      yield* Testing.click("button", "Save")
      yield* Testing.click("button", "Save")
      yield* Testing.click("button", "Tap")
      yield* Testing.click("button", "Tap")
      yield* Testing.findText("1 saves, 2 taps")
      yield* Effect.sleep("150 millis")
      yield* Testing.findText("1 saves, 2 taps")

      yield* Testing.click("button", "Save")
      yield* Testing.findText("2 saves, 2 taps")
    }).pipe(Effect.scoped),
  )
})

describe("an action can be an Effect that works out the action to run", () => {
  it.live("the action it returns runs, and returning nothing runs nothing", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Picker)

      yield* Testing.click("button", "Skip beta")
      yield* Testing.click("button", "Pick")
      yield* Testing.findText("Chose beta, 1 picks")

      yield* Testing.click("button", "Clear")
      yield* Testing.click("button", "Ten more")
      yield* Testing.findText("Chose cleared, 11 picks")
    }).pipe(Effect.scoped),
  )
})
