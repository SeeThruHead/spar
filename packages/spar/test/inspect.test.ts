import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema, SubscriptionRef, pipe } from "effect"
import { Props, Reactive, UiState, View, compose, uses, withHandlers } from "spar"
import * as Testing from "spar/testing"
import { fragment } from "../src/internal/element.ts"
import {
  Inspecting,
  inspecting,
  mark,
  recovering,
  sourceOf,
  sourced,
} from "../src/internal/inspect.ts"
import { Toolbar } from "./composed.tsx"
import { BadgeView } from "./made.tsx"
import { NoteView, TwiceView } from "./tree.tsx"

class Lost extends Schema.TaggedError<Lost, { readonly brand: unique symbol }>()("Lost", {}) {}

const Pair = View.make("Pair", { left: Props.Element, right: Props.Element }, ({ left, right }) =>
  fragment([left, "and", right]),
)

const Sorry = View.make("Sorry", { error: Schema.Unknown }, () => fragment(["Sorry"]))

const Listed = View.make("Listed", { rows: Props.Element }, ({ rows }) => rows)

const Note = View.described(["Notes", "Router.Router"]).taking({ id: Schema.String }, ({ id }) =>
  Effect.map(UiState.make("text", Schema.String, "new"), (text) => ({
    id,
    text,
    onClear: UiState.set(text, ""),
  })),
)(NoteView)

const Twice = View.described(["Clock"]).connect(() =>
  Effect.map(UiState.make("same", Schema.String, "one"), (first) => ({ first })),
)(TwiceView)

const Board = (items: Reactive.Reactive<ReadonlyArray<string>>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      return {
        left: yield* View.child(Twice, {}),
        right: fragment([
          yield* pipe(
            items,
            Reactive.mapBy(
              (id: string) => id,
              Note,
              (_item, id) => ({ id }),
            ),
          ),
          BadgeView({ text: "badge" }),
        ]),
      }
    }),
  )(Pair)

const Rows = View.connect(() =>
  Effect.map(
    pipe(
      Reactive.succeed(["a"]),
      Reactive.mapBy(
        (id: string) => id,
        BadgeView,
        (_item, id) => ({ text: `row ${id}` }),
      ),
    ),
    (rows) => ({ rows }),
  ),
)(Listed)

const inspected = <A, E, R>(use: (inspector: Inspecting) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const inspector = new Inspecting()

      inspecting.write(Option.some(inspector))

      return inspector
    }),
    use,
    () => Effect.sync(() => inspecting.write(Option.none())),
  )

const idOf = (node: Element | null): number => Number(node?.getAttribute(mark))

const onPage = (): ReadonlySet<number> =>
  new Set([...document.querySelectorAll(`[${mark}]`)].map((node) => idOf(node)))

const calm: "calm" | "loud" = "calm"

const NamedBadge = compose(
  uses(["Clock"]),
  withHandlers(() => ({ text: "named badge", tone: calm })),
)(BadgeView)

describe("what the inspector knows about a composed component", () => {
  it.live("with a named view at the end: that view's name, and the services it uses", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        yield* Testing.mount(NamedBadge)

        const seen = Option.getOrThrow(inspector.find(idOf(yield* Testing.findText("named badge"))))

        expect([seen.name, seen.placed]).toEqual([
          "Badge",
          Option.some({ path: ["NamedBadge"], services: ["Clock"] }),
        ])
      }),
    ),
  )

  it.live("its name, its props with their Schema, and where it is in the tree", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        yield* Testing.mount(Toolbar)

        const button = yield* Testing.find("button", "Sort by")
        const seen = Option.getOrThrow(inspector.find(idOf(button.closest(".dropdown"))))

        expect([seen.name, Object.keys(seen.fields), seen.placed]).toEqual([
          "Dropdown",
          ["label", "items", "onPick"],
          Option.some({ path: ["Toolbar", "Dropdown"], services: [] }),
        ])
      }),
    ),
  )
})

describe("what the inspector knows about what is on the page", () => {
  it.live("every view marks its elements and says its name, its props and their Schema", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        const items = yield* SubscriptionRef.make<ReadonlyArray<string>>(["a"])

        yield* Testing.mount(Board(Reactive.fromSubscriptionRef(items)))

        const badge = yield* Testing.findText("badge")
        const seen = Option.getOrThrow(inspector.find(idOf(badge)))

        expect([seen.name, seen.props, seen.fields, seen.placed]).toEqual([
          "Badge",
          { text: "badge" },
          BadgeView.props,
          Option.none(),
        ])
        expect(Props.allShown(BadgeView.props, seen.props)).toEqual({ text: "badge", tone: null })
      }),
    ),
  )

  it.live("a component also says where it is in the tree and which services it uses", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        const items = yield* SubscriptionRef.make<ReadonlyArray<string>>(["a", "b"])

        yield* Testing.mount(Board(Reactive.fromSubscriptionRef(items)))

        const second = (yield* Testing.find("button", "Clear b")).closest("li")
        const note = Option.getOrThrow(inspector.find(idOf(second)))
        const twice = Option.getOrThrow(inspector.find(idOf(yield* Testing.findText("one"))))

        expect([note.name, note.placed]).toEqual([
          "NoteView",
          Option.some({ path: ["Pair", "NoteView[b]"], services: ["Notes", "Router.Router"] }),
        ])
        expect([twice.name, twice.placed]).toEqual([
          "TwiceView",
          Option.some({ path: ["Pair", "TwiceView"], services: ["Clock"] }),
        ])
        expect(Props.allShown(NoteView.props, note.props)).toEqual({
          id: "b",
          text: "new",
          onClear: "action",
        })
        expect(inspector.find(0)).toEqual(Option.none())

        yield* SubscriptionRef.set(items, ["b"])
        yield* Testing.gone("button", "Clear a")
        inspector.keepOnly(onPage())
        expect([...inspector.seen.values()].map((kept) => kept.name).toSorted()).toEqual([
          "Badge",
          "NoteView",
          "TwiceView",
        ])
      }),
    ),
  )

  it.live("a view that is only a list is known but has nothing of its own to mark", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        yield* Testing.mount(Rows)

        const row = yield* Testing.findText("row a")

        expect(Option.getOrThrow(inspector.find(idOf(row))).name).toBe("Badge")
        expect([...inspector.seen.values()].map((seen) => seen.name)).toEqual(["Listed", "Badge"])
        expect([...inspector.seen.keys()]).toEqual([1, 2])
      }),
    ),
  )

  it.live("a component that recovers from a failure says which, and by which view", () =>
    inspected(
      Effect.fnUntraced(function* (inspector) {
        yield* Testing.mount(
          pipe(
            View.connect(() => Effect.succeed({ text: "safe" }))(BadgeView),
            View.recover(Lost, Sorry),
            View.recover(Schema.Struct({ error: Schema.String }), Sorry),
          ),
        )

        const seen = Option.getOrThrow(inspector.find(idOf(yield* Testing.findText("safe"))))

        expect(seen.recovers).toEqual(["Lost is shown by Sorry", "Schema is shown by Sorry"])
      }),
    ),
  )

  it.live("a reactive value says which store selector it is, or is made from", () =>
    inspected(
      Effect.fnUntraced(function* () {
        const selector = Reactive.succeed(1)
        const derived = Reactive.map(
          Reactive.map(selector, (count) => count + 1),
          String,
        )

        yield* Effect.sync(() => sourced(selector, "shop . count"))
        expect(sourceOf(selector)).toEqual(Option.some("shop . count"))
        expect(sourceOf(derived)).toEqual(Option.some("made from shop . count"))
        expect(sourceOf(Reactive.succeed(2))).toEqual(Option.none())
        expect(sourceOf(Reactive.map(Reactive.succeed(2), String))).toEqual(Option.none())
        expect(sourceOf("shop . count")).toEqual(Option.none())
      }),
    ),
  )

  it("where a value came from is remembered with no inspector too, so a trace can name it", () => {
    const selector = Reactive.succeed(1)

    sourced(selector, "shop . count")
    recovering("Lost", "Listed")
    expect(sourceOf(selector)).toEqual(Option.some("shop . count"))
    expect(sourceOf(Reactive.map(selector, (count) => count + 1))).toEqual(
      Option.some("made from shop . count"),
    )
  })

  it.live("with no inspector nothing is marked", () =>
    Effect.gen(function* () {
      yield* Testing.mount(View.connect(() => Effect.succeed({ text: "plain" }))(BadgeView))
      expect((yield* Testing.findText("plain")).getAttribute(mark)).toBeNull()
      expect(document.querySelector(`[${mark}]`)).toBeNull()
    }),
  )
})
