import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Option, Ref, Schema } from "effect"
import { State, Timeline, UiState, compose } from "spar"
import * as Testing from "spar/testing"
import * as Dom from "../src/internal/dom.ts"
import { DraftView } from "./typing.tsx"

const Draft = compose(
  Effect.fnUntraced(function* () {
    const text = yield* UiState.make("text", Schema.String, "")

    return {
      text,
      onType: (event: InputEvent) =>
        UiState.set(text, event.target instanceof HTMLInputElement ? event.target.value : ""),
      onLoad: Effect.gen(function* () {
        yield* Effect.sleep("20 millis")
        yield* UiState.set(text, "from the server")
      }),
      onClear: UiState.set(text, ""),
    }
  }),
)(DraftView)

const typedIn = (
  tag: string,
  attributes: ReadonlyArray<readonly [string, string]>,
): HTMLElement => {
  const node = document.createElement(tag)

  attributes.forEach(([name, value]) => node.setAttribute(name, value))
  document.body.append(node)
  node.dispatchEvent(new Event("input", { bubbles: true }))

  return node
}

const field = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Draft" })

describe("a field the user is typing in", () => {
  it.live("is reported when an older answer replaces what was typed since, and not otherwise", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const notices = Effect.map(Ref.get(noted), (all) =>
        all.filter((seen) => seen.kind === "noticed").map((seen) => [seen.name, seen.detail]),
      )

      yield* Testing.mount(Draft).pipe(
        Effect.provideService(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      )
      yield* Testing.fill("textbox", "Draft", "a")
      yield* Testing.click("button", "Clear")
      yield* Testing.eventually(() => expect(field().value).toBe(""))
      expect(yield* notices).toEqual([])

      yield* Testing.click("button", "Load")
      yield* Testing.fill("textbox", "Draft", "typed after the load began")
      yield* Testing.eventually(() => expect(field().value).toBe("from the server"))
      expect(yield* notices).toEqual([
        [
          'input[aria-label="Draft"]',
          {
            code: "SPAR_TYPING_REPLACED",
            said: 'What was typed in input[aria-label="Draft"] was replaced by a value from something that began before the last keystroke.',
            in: "",
            at: "",
          },
        ],
      ])

      yield* Testing.click("button", "Load")
      yield* Effect.sleep("40 millis")
      expect((yield* notices).length).toBe(1)
    }).pipe(Effect.provide(State.layer)),
  )

  it("counts only text entry as typing: a select or a checkbox given a value is not reported", () => {
    Dom.watchTyping(document)

    expect(
      [
        typedIn("input", []),
        typedIn("input", [["type", "search"]]),
        typedIn("textarea", []),
        typedIn("select", []),
        typedIn("input", [["type", "checkbox"]]),
      ].map((node) => Dom.typingReplaced(node, "value", "from elsewhere", Option.some(0))),
    ).toEqual([true, true, true, false, false])
    expect(Dom.typingReplaced(typedIn("input", []), "value", "from elsewhere", Option.none())).toBe(
      false,
    )
  })
})
