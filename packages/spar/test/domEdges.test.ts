import { describe, expect, it } from "@effect/vitest"
import { fireEvent } from "@testing-library/dom"
import { Option } from "effect"
import { described, typingReplaced, watchTyping } from "../src/internal/dom.ts"

const typedInto = (type: string | null): HTMLElement => {
  const field = document.createElement(type === "textarea" ? "textarea" : "input")

  if (type !== null && type !== "textarea") field.setAttribute("type", type)
  document.body.append(field)
  fireEvent.input(field, { target: { value: "typed" } })

  return field
}

const replaced = (field: HTMLElement) =>
  typingReplaced(field, "value", "from the store", Option.some(0))

const named = (attributes: Readonly<Record<string, string>>) => {
  const node = document.createElement("input")

  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value))

  return described(node)
}

describe("typing that a write would replace", () => {
  it("is noticed in every field a person types into, and in no other", () => {
    watchTyping(document)

    expect(
      [null, "text", "search", "email", "url", "tel", "password", "number", "textarea"].map(
        (type) => replaced(typedInto(type)),
      ),
    ).toEqual([true, true, true, true, true, true, true, true, true])
    expect(["checkbox", "range", "date"].map((type) => replaced(typedInto(type)))).toEqual([
      false,
      false,
      false,
    ])
    expect(replaced(document.createElement("div"))).toBe(false)
  })

  it("is not noticed for another attribute, the same value, or a write nothing caused", () => {
    watchTyping(document)

    const field = typedInto("text")

    expect([
      typingReplaced(field, "placeholder", "x", Option.some(0)),
      typingReplaced(field, "value", "typed", Option.some(0)),
      typingReplaced(field, "value", "other", Option.none()),
      typingReplaced(field, "value", "other", Option.some(Number.MAX_SAFE_INTEGER)),
    ]).toEqual([false, false, false, false])
  })
})

describe("an element described in a message", () => {
  it("is its tag and the first of its name, label or id", () => {
    expect([
      named({}),
      named({ name: "email" }),
      named({ "aria-label": "Email" }),
      named({ id: "email" }),
      named({ id: "email", name: "address", "aria-label": "Email" }),
    ]).toEqual([
      "input",
      'input[name="email"]',
      'input[aria-label="Email"]',
      'input[id="email"]',
      'input[name="address"]',
    ])
  })
})
