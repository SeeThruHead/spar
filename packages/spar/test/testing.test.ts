import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema, SubscriptionRef } from "effect"
import { Events, Reactive, UiState, View } from "spar"
import * as Testing from "spar/testing"
import { DraftView } from "./forms.tsx"
import { LoadedView } from "./views.tsx"

const Draft = View.connect(
  Effect.fnUntraced(function* () {
    const draft = yield* UiState.make("draft", Schema.String, "")
    const urgent = yield* UiState.make("urgent", Schema.Boolean, false)
    const saved = yield* SubscriptionRef.make("")

    yield* Events.onDocument("keyup", (event) =>
      event.key === "Enter" ? SubscriptionRef.set(saved, "sent with Enter") : [],
    )

    return {
      draft,
      urgent,
      saved: Reactive.fromSubscriptionRef(saved),
      onSave: Effect.flatMap(draft.get, (text) => SubscriptionRef.set(saved, text)),
    }
  }),
)(DraftView)

describe("spar/testing", () => {
  it.live("a pure view is rendered with plain props and found by role and name", () =>
    Effect.gen(function* () {
      yield* Testing.render(LoadedView, { title: "Quarterly report" })

      expect((yield* Testing.find("heading", "Quarterly report")).textContent).toBe(
        "Quarterly report",
      )
      expect((yield* Testing.findText("Quarterly report")).tagName).toBe("H2")
    }),
  )

  it.live("a component is driven the way a person would: fill, click, press", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Draft)
      yield* Testing.fill("textbox", "Note", "Order rivets")
      yield* Testing.click("button", "Save note")

      const saved = yield* Testing.find("status", "Saved")

      yield* Testing.eventually(() => expect(saved.textContent).toBe("Order rivets"))
      yield* Testing.press("Enter")
      yield* Testing.eventually(() => expect(saved.textContent).toBe("sent with Enter"))
      yield* Testing.click("checkbox", "Urgent")
      yield* Testing.gone("button", "Save note")
    }),
  )

  it.live("something that never appears fails with what was expected", () =>
    Effect.gen(function* () {
      yield* Testing.render(LoadedView, { title: "Quarterly report" })

      const missing = yield* Effect.flip(Testing.find("button", "Delete"))
      const stuck = yield* Effect.flip(Testing.gone("heading"))

      expect(missing.message).toBe(
        [
          '[SPAR_NOT_ON_SCREEN] Expected a button named "Delete", and the screen never showed it.',
          "  fix: Check the role and name asked for against what the view draws, and that the data it needs was provided in the test's layer.",
          '  see: LLMS.md, section "SPAR_NOT_ON_SCREEN"',
        ].join("\n"),
      )
      expect(stuck.message).toContain(
        "[SPAR_NOT_ON_SCREEN] Expected no more a heading, and the screen never showed it.",
      )
    }),
  )
})
