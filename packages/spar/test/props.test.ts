import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema, SubscriptionRef } from "effect"
import { Devtools, Form, Handle, Overlay, Props, Reactive, Router, UiState, View } from "spar"
import * as Testing from "spar/testing"
import { check } from "spar/transform/check"
import { BadgeView, CardView } from "./made.tsx"

const Card = (picked: SubscriptionRef.SubscriptionRef<string>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const draft = yield* UiState.make("draft", Schema.String, "hello")

      return {
        title: Reactive.fromSubscriptionRef(picked),
        draft,
        count: 2,
        body: BadgeView({ text: "inside", tone: "loud" }),
        field: yield* Handle.make,
        onSave: SubscriptionRef.set(picked, "saved"),
        onPick: (id: string) => SubscriptionRef.set(picked, id),
      }
    }),
  )(CardView)

const formField = { value: Reactive.succeed("typed"), change: () => [], touch: [] }

const link = { href: "/people", onClick: [] }

const fits = (field: Props.Field, value: unknown): boolean => Schema.is(field)(value)

describe("a view made from a Schema of its props", () => {
  it.live("draws like any view, with every kind of prop", () =>
    Effect.gen(function* () {
      const picked = yield* SubscriptionRef.make("Notes")

      yield* Testing.mount(Card(picked))
      yield* Testing.find("heading", "Notes")
      expect((yield* Testing.findText("2 notes")).dataset["tone"]).toBe("calm")
      expect((yield* Testing.findText("inside")).dataset["tone"]).toBe("loud")
      yield* Testing.fill("textbox", "Draft", "changed")
      yield* Testing.click("button", "Pick first")
      yield* Testing.find("heading", "first")
      yield* Testing.click("button", "Save")
      yield* Testing.find("heading", "saved")
      expect(yield* UiState.snapshot).toEqual([{ path: ["Card"], name: "draft", value: "changed" }])
    }).pipe(Effect.provideService(UiState.Tree, UiState.makeTree())),
  )

  it.live("its props can be shown as data: values as they are now, the rest by kind", () =>
    Effect.gen(function* () {
      const live = yield* SubscriptionRef.make("later")

      expect(CardView.displayName).toBe("Card")
      expect(
        Props.allShown(CardView.props, {
          title: Reactive.succeed("Notes"),
          draft: Reactive.succeed("typed"),
          count: 2,
          body: BadgeView({ text: "x" }),
          onSave: Effect.void,
          onPick: () => [],
        }),
      ).toEqual({
        title: "Notes",
        count: 2,
        body: "element",
        onSave: "action",
        onPick: "callback",
      })
      expect(Props.allShown(BadgeView.props, { text: "x", tone: "loud" })).toEqual({
        text: "x",
        tone: "loud",
      })
      expect(Props.allShown(BadgeView.props, { text: 4 })).toEqual({ tone: null })
      expect(Props.allShown(BadgeView.props, null)).toEqual({ tone: null })
      expect(Option.isNone(Props.shown(Props.Reactive(Schema.String), "plain"))).toBe(true)
      expect(
        Props.allShown(
          { title: Props.Reactive(Schema.String) },
          { title: Reactive.fromSubscriptionRef(live) },
        ),
      ).toEqual({})
    }),
  )

  it("each kind accepts only its own", () => {
    expect(fits(Props.Reactive(Schema.String), Reactive.succeed("a"))).toBe(true)
    expect(fits(Props.Reactive(Schema.String), "a")).toBe(false)
    expect(fits(Props.State(Schema.String), Reactive.succeed("a"))).toBe(false)
    expect(fits(Props.Action, Effect.void)).toBe(true)
    expect(fits(Props.Action, [])).toBe(true)
    expect(fits(Props.Action, UiState.set)).toBe(false)
    expect(fits(Props.Element, BadgeView({ text: "x" }))).toBe(true)
    expect(fits(Props.Element, "x")).toBe(false)
    expect(fits(Props.Handle, {})).toBe(false)
    expect(fits(Props.Callback(Schema.String), () => [])).toBe(true)
    expect(fits(Props.Callback(Schema.String), [])).toBe(false)
    expect(fits(Props.Handler("keydown"), () => [])).toBe(true)
    expect(fits(Props.Handler("keydown"), null)).toBe(false)
    expect(Props.shown(Props.Handler("click"), [])).toEqual(Option.some("handler"))
    expect(fits(Form.Field(Schema.String), formField)).toBe(true)
    expect(fits(Form.Field(Schema.String), { change: 1 })).toBe(false)
    expect(fits(Form.Field(Schema.String), { value: 1 })).toBe(false)
    expect(Props.shown(Form.Field(Schema.String), formField)).toEqual(Option.some("typed"))
    expect(Props.shown(Form.Field(Schema.String), "typed")).toEqual(Option.none())
    expect(fits(Router.Link, link)).toBe(true)
    expect(fits(Router.Link, { href: "/people" })).toBe(false)
    expect(Props.shown(Router.Link, link)).toEqual(Option.some("/people"))
    expect(Props.shown(Router.Link, "/people")).toEqual(Option.none())
    expect(fits(Overlay.Placement, { position: "fixed", maxHeight: "1px" })).toBe(true)
    expect(fits(Overlay.Placement, { position: "fixed" })).toBe(false)
    expect(fits(Devtools.InspectedStore, { travelTo: 1 })).toBe(true)
    expect(fits(Devtools.InspectedStore, {})).toBe(false)
    expect(fits(Devtools.OutboxShown, { persist: 1 })).toBe(true)
    expect(fits(Devtools.OutboxShown, {})).toBe(false)
    expect(Props.shown(Overlay.Placement, { position: "fixed", maxHeight: "1px" })).toEqual(
      Option.some("placement"),
    )
  })

  it("the build check lets JSX be the body of View.make and nowhere else in a call", () => {
    const made = `const AView = View.make("A", { text: Schema.String }, ({ text }) => <p>{text}</p>)`
    const other = `const rows = items.map((item) => <li>{item}</li>)`

    expect(check("a.tsx", made)).toEqual([])
    expect(check("b.tsx", other).map((violation) => violation.rule)).toEqual(["jsx-only-in-views"])
  })
})
