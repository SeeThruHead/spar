import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Fiber, Layer, Schema, Stream, SubscriptionRef, pipe } from "effect"
import { Reactive, Server, UiState, View, compose, withProps } from "spar"
import * as Testing from "spar/testing"
import { BoardView, NoteView, PanelView, TwiceView } from "./tree.tsx"

type Item = { readonly id: string }

const Note = compose(withProps({ id: Schema.String }), ({ id }) =>
  Effect.map(UiState.make("text", Schema.String, "new"), (text) => ({
    id,
    text,
    onClear: UiState.set(text, ""),
  })),
)(NoteView)

const Panel = compose(() =>
  Effect.map(UiState.make("open", Schema.Boolean, false), (open) => ({ open })),
)(PanelView)

const Board = (items: Reactive.Reactive<ReadonlyArray<Item>>, shown: Reactive.Reactive<boolean>) =>
  compose(
    Effect.fnUntraced(function* () {
      return {
        title: yield* UiState.make("title", Schema.String, "Board"),
        always: yield* View.child(Panel, {}),
        sometimes: yield* pipe(shown, Reactive.when(Panel, {})),
        notes: yield* pipe(
          items,
          Reactive.mapBy(
            (item: Item) => item.id,
            Note,
            (_item, id) => ({ id }),
          ),
        ),
      }
    }),
  )(BoardView)

const Twice = compose(
  Effect.fnUntraced(function* () {
    const first = yield* UiState.make("same", Schema.String, "one")

    yield* UiState.make("same", Schema.String, "two")

    return { first }
  }),
)(TwiceView)

const sorted = (entries: UiState.Snapshot): ReadonlyArray<string> =>
  entries
    .map((entry) => `${entry.path.join(" / ")} . ${entry.name} = ${JSON.stringify(entry.value)}`)
    .toSorted()

const board = Effect.fnUntraced(function* () {
  const items = yield* SubscriptionRef.make<ReadonlyArray<Item>>([{ id: "a" }, { id: "b" }])
  const shown = yield* SubscriptionRef.make(true)

  yield* Testing.mount(
    Board(Reactive.fromSubscriptionRef(items), Reactive.fromSubscriptionRef(shown)),
  )
  yield* Testing.find("heading", "Board")

  return { items, shown }
})

const ownTree = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(effect, UiState.Tree, UiState.makeTree())

const notes = (): ReadonlyArray<string | null> =>
  screen.getAllByRole("status", { name: "Note" }).map((note) => note.textContent)

describe("one tree of all UI state", () => {
  it.live("every piece is there under its component's place, rows by key", () =>
    ownTree(
      Effect.gen(function* () {
        yield* board()

        expect(sorted(yield* UiState.snapshot)).toEqual([
          'BoardView . title = "Board"',
          'BoardView / Note[a] . text = "new"',
          'BoardView / Note[b] . text = "new"',
          "BoardView / Panel . open = false",
          "BoardView / Panel#2 . open = false",
        ])
      }),
    ),
  )

  it.live("a value set from outside shows on the screen, and a wrong one is refused", () =>
    ownTree(
      Effect.gen(function* () {
        yield* board()

        expect(yield* UiState.put(["BoardView"], "title", "Renamed")).toBe(true)
        yield* Testing.find("heading", "Renamed")
        expect(yield* UiState.put(["BoardView"], "title", 7)).toBe(false)
        expect(yield* UiState.put(["BoardView"], "missing", "x")).toBe(false)
        expect(yield* UiState.put(["Nowhere"], "title", "x")).toBe(false)
        expect(screen.getByRole("heading").textContent).toBe("Renamed")
      }),
    ),
  )

  it.live("what leaves the screen leaves the tree, and its place is free again", () =>
    ownTree(
      Effect.gen(function* () {
        const { items, shown } = yield* board()

        yield* SubscriptionRef.set(items, [{ id: "b" }])
        yield* SubscriptionRef.set(shown, false)
        yield* Testing.eventually(() => expect(notes()).toHaveLength(1))
        yield* Testing.eventually(() => expect(screen.getAllByText("Panel")).toHaveLength(1))
        expect(sorted(yield* UiState.snapshot)).toEqual([
          'BoardView . title = "Board"',
          'BoardView / Note[b] . text = "new"',
          "BoardView / Panel . open = false",
        ])

        yield* SubscriptionRef.set(shown, true)
        yield* Testing.eventually(() => expect(screen.getAllByText("Panel")).toHaveLength(2))
        expect(sorted(yield* UiState.snapshot)).toContain("BoardView / Panel#2 . open = false")
      }),
    ),
  )

  it.live("every change is told: added, set and removed", () =>
    ownTree(
      Effect.gen(function* () {
        const seen = yield* Effect.forkScoped(Stream.runCollect(Stream.take(UiState.changes, 8)), {
          startImmediately: true,
        })

        const { items } = yield* board()

        yield* Testing.click("button", "Clear a")
        yield* Testing.eventually(() => expect(notes()).toEqual(["", "new"]))
        yield* Testing.click("button", "Clear a")
        yield* SubscriptionRef.set(items, [])
        yield* Testing.gone("status", "Note")

        const told = (yield* Fiber.join(seen)).map(
          (change) =>
            `${change.kind} ${change.path.at(-1)}.${change.name}=${JSON.stringify(change.value)}`,
        )

        expect(told).toEqual([
          'added BoardView.title="Board"',
          "added Panel.open=false",
          'added Note[a].text="new"',
          'added Note[b].text="new"',
          "added Panel#2.open=false",
          'set Note[a].text=""',
          'removed Note[a].text=""',
          'removed Note[b].text="new"',
        ])
      }),
    ),
  )

  it.live("a snapshot puts everything back, and waits for what is not on screen yet", () =>
    ownTree(
      Effect.gen(function* () {
        const { items } = yield* board()
        const before = yield* UiState.snapshot

        yield* Testing.click("button", "Clear a")
        yield* UiState.put(["BoardView"], "title", "Later")
        yield* Testing.find("heading", "Later")
        yield* UiState.restore(before)
        yield* Testing.find("heading", "Board")
        expect(notes()).toEqual(["new", "new"])

        yield* SubscriptionRef.set(items, [{ id: "b" }])
        yield* Testing.eventually(() => expect(notes()).toHaveLength(1))
        yield* UiState.restore([
          { path: ["BoardView", "Note[a]"], name: "text", value: "kept" },
          { path: ["BoardView", "Note[b]"], name: "text", value: "seen" },
        ])
        yield* Testing.eventually(() => expect(notes()).toEqual(["seen"]))
        yield* SubscriptionRef.set(items, [{ id: "a" }, { id: "b" }])
        yield* Testing.eventually(() => expect(notes()).toEqual(["kept", "seen"]))

        yield* SubscriptionRef.set(items, [{ id: "b" }])
        yield* Testing.eventually(() => expect(notes()).toHaveLength(1))
        yield* SubscriptionRef.set(items, [{ id: "a" }, { id: "b" }])
        yield* Testing.eventually(() => expect(notes()).toEqual(["new", "seen"]))

        yield* UiState.restore([{ path: ["BoardView", "Note[c]"], name: "text", value: "old" }])
        yield* UiState.restore([])
        yield* SubscriptionRef.set(items, [{ id: "c" }])
        yield* Testing.eventually(() => expect(notes()).toEqual(["new"]))
      }),
    ),
  )

  it.live("two pieces with one name in a component are told apart by number", () =>
    ownTree(
      Effect.gen(function* () {
        yield* Testing.mount(Twice)
        yield* Testing.findText("one")

        expect(sorted(yield* UiState.snapshot)).toEqual([
          'Twice . same = "one"',
          'Twice . same#2 = "two"',
        ])
      }),
    ),
  )

  it.live("a page drawn on the server keeps its UI state to itself", () =>
    ownTree(
      Effect.gen(function* () {
        const html = yield* Server.renderToString(
          Board(Reactive.succeed([{ id: "a" }]), Reactive.succeed(false)),
          { layer: Layer.empty },
        )

        expect(html).toContain("<h1>Board</h1>")
        expect(yield* UiState.snapshot).toEqual([])
      }),
    ),
  )
})
