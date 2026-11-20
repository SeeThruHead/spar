import { describe, expect, it, vi } from "@effect/vitest"
import { fireEvent } from "@testing-library/dom"
import { Effect, Option, pipe, Schema, SubscriptionRef } from "effect"
import { TestClock } from "effect/testing"
import { Handle, Reactive, UiState, compose } from "spar"
import { OptionsView, PickerView } from "./focus.tsx"
import { eventually, find, gone, mount } from "spar/testing"

const describeBox = Option.match({
  onNone: () => "not on the page",
  onSome: (box: { readonly width: number; readonly height: number }) =>
    `${box.width} by ${box.height}`,
})

const Picker = compose(
  Effect.fnUntraced(function* () {
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const trigger = yield* Handle.make
    const first = yield* Handle.make
    const missing = yield* Handle.make
    const note = yield* SubscriptionRef.make("")
    const options = yield* pipe(
      open,
      Reactive.when(OptionsView, {
        first,
        onClose: [UiState.set(open, false), Handle.focus(trigger), Handle.scrollIntoView(trigger)],
      }),
    )

    return {
      open,
      trigger,
      options,
      note: Reactive.fromSubscriptionRef(note),
      onOpen: [UiState.set(open, true), Handle.focus(first)],
      onMeasure: Effect.flatMap(Handle.measure(first), (box) =>
        SubscriptionRef.set(note, describeBox(box)),
      ),
      onFocusMissing: [Handle.focus(missing), SubscriptionRef.set(note, "gave up")],
    }
  }),
)(PickerView)

const click = (name: string) =>
  Effect.flatMap(find("button", name), (button) => Effect.sync(() => fireEvent.click(button)))

describe("handles", () => {
  it.live("focus moves into a list when it opens and back to its button when it closes", () =>
    Effect.gen(function* () {
      yield* mount(Picker)
      yield* click("Pick a colour")

      const trigger = yield* find("button", "Pick a colour")
      const red = yield* find("option", "Red")
      const scrolled = vi.spyOn(trigger, "scrollIntoView")

      yield* eventually(() => expect(document.activeElement).toBe(red))
      yield* Effect.sync(() => fireEvent.click(red))
      yield* gone("listbox")
      yield* eventually(() => expect(document.activeElement).toBe(trigger))
      yield* eventually(() =>
        expect(scrolled.mock.calls).toEqual([[{ block: "nearest", inline: "nearest" }]]),
      )
    }),
  )

  it.live("measuring gives the node's box while it is on the page and nothing when it is not", () =>
    Effect.gen(function* () {
      yield* mount(Picker)

      const note = yield* find("status", "Note")

      yield* click("Measure")
      yield* eventually(() => expect(note.textContent).toBe("not on the page"))

      yield* click("Pick a colour")
      yield* find("option", "Red")
      yield* click("Measure")
      yield* eventually(() => expect(note.textContent).toBe("0 by 0"))
    }),
  )

  it.effect("focusing a handle that never reaches the page gives up after a second", () =>
    Effect.gen(function* () {
      yield* mount(Picker)

      const note = yield* find("status", "Note")

      yield* click("Focus something missing")
      yield* TestClock.adjust("999 millis")

      expect(note.textContent).toBe("")

      yield* TestClock.adjust("1 millis")

      expect(note.textContent).toBe("gave up")
    }),
  )
})
