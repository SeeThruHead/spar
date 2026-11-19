import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, pipe, Queue, Ref, Schema, Stream, SubscriptionRef } from "effect"
import { Reactive, UiState, View } from "spar"
import { jsx } from "spar/jsx-runtime"
import { CountView, DraftView, EmptyView, SpanView } from "./forms.tsx"
import { eventually, find, findText, gone, mount } from "spar/testing"
import { BoardView, ItemView } from "./views.tsx"
import type { Item } from "./views.tsx"

const Draft = (saved: Ref.Ref<ReadonlyArray<string>>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const draft = yield* UiState.make("draft", Schema.String, "")
      const urgent = yield* UiState.make("urgent", Schema.Boolean, false)
      const last = yield* SubscriptionRef.make("")

      return {
        draft,
        urgent,
        saved: Reactive.fromSubscriptionRef(last),
        onSave: Effect.gen(function* () {
          const text = yield* draft.get

          yield* Ref.update(saved, (all) => [...all, text])
          yield* SubscriptionRef.set(last, text)
        }),
      }
    }),
  )(DraftView)

const spanProps = Effect.fnUntraced(function* () {
  const span = yield* Effect.currentSpan

  return { span: span.name }
}, Effect.orDie)

const Traced = View.connect(spanProps)(SpanView)

const TracedUnnamed = View.connect(spanProps)(
  View.make("", { span: Schema.String }, ({ span }) => jsx("p", { role: "note", children: span })),
)

const Counted = (count: number) =>
  pipe(
    CountView,
    View.branch((props: { readonly count: number }) => props.count === 0, EmptyView),
    View.mapProps(() => ({ count })),
  )

const Listed = (
  list: Reactive.Reactive<ReadonlyArray<Item>>,
  items: Queue.Queue<Reactive.Reactive<Item>>,
) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const rows = yield* pipe(
        list,
        Reactive.mapBy(
          (item: Item) => item.id,
          ItemView,
          (item) => {
            Queue.offerUnsafe(items, item)

            return { item }
          },
        ),
      )

      return { total: Reactive.map(list, (all) => all.length), rows, onAdd: Effect.void }
    }),
  )(BoardView)

const LooseView = View.make("LooseView", {}, () =>
  jsx("p", {
    role: "note",
    title: { not: "text" },
    onClick: undefined,
    children: [null, "kept", Reactive.map(Reactive.succeed(1), () => null)],
  }),
)

describe("composition", () => {
  it.live("typing changes UI state, and one click can run an effect and reset the draft", () =>
    Effect.gen(function* () {
      const saved = yield* Ref.make<ReadonlyArray<string>>([])

      yield* mount(Draft(saved))

      const input = yield* find("textbox", "Note")
      const urgent = yield* find("checkbox", "Urgent")
      const save = yield* find("button", "Save note")

      yield* Effect.sync(() => fireEvent.input(input, { target: { value: "Buy bolts" } }))
      yield* Effect.sync(() => fireEvent.click(save))
      yield* eventually(() => expect(input).toHaveProperty("value", ""))

      expect(yield* Ref.get(saved)).toEqual(["Buy bolts"])
      expect((yield* find("status", "Saved")).textContent).toBe("Buy bolts")
      expect(save.hasAttribute("disabled")).toBe(false)

      yield* Effect.sync(() => fireEvent.click(urgent))
      yield* eventually(() => expect(urgent).toHaveProperty("checked", true))
      yield* eventually(() => expect(save.hasAttribute("hidden")).toBe(true))
    }),
  )

  it.live("a component mounts inside a span named after its view", () =>
    Effect.gen(function* () {
      yield* mount(Traced)

      expect((yield* find("note")).textContent).toBe("SpanView")
    }),
  )

  it.live("a component whose view has no name still mounts inside a span", () =>
    Effect.gen(function* () {
      yield* mount(TracedUnnamed)

      expect((yield* find("note")).textContent).toBe("View (unnamed)")
    }),
  )

  it.live("branch mounts the other component when its test holds", () =>
    Effect.gen(function* () {
      yield* mount(Counted(0))

      expect((yield* find("status")).textContent).toBe("Nothing here")
    }),
  )

  it.live("branch mounts the component itself when its test does not hold", () =>
    Effect.gen(function* () {
      yield* mount(Counted(3))

      expect((yield* find("status")).textContent).toBe("3 items")
    }),
  )

  it.live("values that are not text, attributes or handlers are left out", () =>
    Effect.gen(function* () {
      yield* mount(
        pipe(
          LooseView,
          View.mapProps(() => ({})),
        ),
      )

      const note = yield* find("note")

      yield* Effect.sync(() => fireEvent.click(note))

      expect(note.textContent).toBe("kept")
      expect(note.hasAttribute("title")).toBe(false)
      expect(screen.getAllByRole("note")).toEqual([note])
    }),
  )

  it.effect("two reactive values zipped together follow whichever changes", () =>
    Effect.gen(function* () {
      const left = yield* SubscriptionRef.make("a")
      const numbers = yield* Queue.unbounded<number>()
      const right = yield* Reactive.fromStream(1, Stream.fromQueue(numbers))
      const both = yield* Reactive.zip(Reactive.fromSubscriptionRef(left), right)

      expect(yield* both.get).toEqual(["a", 1])

      yield* SubscriptionRef.set(left, "b")
      yield* Queue.offer(numbers, 2)
      yield* Effect.yieldNow

      expect(yield* both.get).toEqual(["b", 2])
    }),
  )

  it.live("a row's item keeps its last value once the row has left the list", () =>
    Effect.gen(function* () {
      const list = yield* SubscriptionRef.make<ReadonlyArray<Item>>([{ id: "a", label: "Alpha" }])
      const items = yield* Queue.unbounded<Reactive.Reactive<Item>>()

      yield* mount(Listed(Reactive.fromSubscriptionRef(list), items))
      yield* findText("Alpha")

      const item = yield* Queue.take(items)

      yield* SubscriptionRef.set(list, [])
      yield* gone("listitem")

      expect(yield* item.get).toEqual({ id: "a", label: "Alpha" })
    }),
  )
})
