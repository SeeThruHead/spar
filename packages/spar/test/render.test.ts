import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Context, Deferred, Effect, Layer, Ref, Schema, pipe } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, Reactive, Store, UiState, View } from "spar"
import {
  BoardView,
  DetailsView,
  DisclosureView,
  FailedView,
  ItemView,
  LoadedView,
  LoadingView,
} from "./views.tsx"
import type { Item } from "./views.tsx"

type State = { readonly items: ReadonlyArray<Item> }

const initialState: State = { items: [] }

class Board extends Store.Tag<Board>()("test/Board", {
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ label: Schema.String }), (state: State, { label }) => ({
      items: [...state.items, { id: `item-${state.items.length + 1}`, label }],
    })),
    renamed: Store.action(
      Schema.Struct({ id: Schema.String, label: Schema.String }),
      (state: State, { id, label }) => ({
        items: state.items.map((item) => (item.id === id ? { id, label } : item)),
      }),
    ),
    reversed: Store.action(Schema.Void, (state: State) => ({ items: state.items.toReversed() })),
    removed: Store.action(Schema.Struct({ id: Schema.String }), (state: State, { id }) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  },
  selectors: {
    items: (state) => state.items,
    total: (state) => state.items.length,
  },
}) {}

class Probe extends Context.Service<
  Probe,
  {
    readonly mounts: Ref.Ref<number>
    readonly unmounts: Ref.Ref<number>
    readonly loaded: Deferred.Deferred<string, LoadFailed>
  }
>()("test/Probe") {
  static readonly layer = Layer.effect(
    Probe,
    Effect.gen(function* () {
      return Probe.of({
        mounts: yield* Ref.make(0),
        unmounts: yield* Ref.make(0),
        loaded: yield* Deferred.make<string, LoadFailed>(),
      })
    }),
  )
}

class LoadFailed extends Schema.TaggedError<LoadFailed>()("LoadFailed", {
  message: Schema.String,
}) {}

const layer = Layer.mergeAll(Board.layer(), Probe.layer).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
)

const BoardPanel = View.connect(
  Effect.fnUntraced(function* () {
    const board = yield* Board
    const probe = yield* Probe

    yield* Ref.update(probe.mounts, (count) => count + 1)

    return {
      total: board.select.total,
      rows: yield* pipe(
        board.select.items,
        Reactive.mapBy(
          (item: Item) => item.id,
          ItemView,
          (item) => ({ item }),
        ),
      ),
      onAdd: board.commands.added({ label: "From the button" }),
    }
  }),
)(BoardView)

const Details = View.connect(
  Effect.fnUntraced(function* ({ note }: { readonly note: string }) {
    const probe = yield* Probe

    yield* Ref.update(probe.mounts, (count) => count + 1)
    yield* Effect.addFinalizer(() => Ref.update(probe.unmounts, (count) => count + 1))

    return { note }
  }),
)(DetailsView)

const Disclosure = View.connect(
  Effect.fnUntraced(function* () {
    const open = yield* UiState.make(false)

    return { open, details: yield* pipe(open, Reactive.when(Details, { note: "Now you see me" })) }
  }),
)(DisclosureView)

const Loaded = View.connect(
  Effect.fnUntraced(function* (_: { readonly id: string }) {
    const probe = yield* Probe

    return { title: yield* Deferred.await(probe.loaded) }
  }),
)(LoadedView)

const Loader = pipe(Loaded, View.recover("LoadFailed", FailedView), View.pending(LoadingView))

const LoaderPage = pipe(
  Loader,
  View.mapProps((_: Record<never, never>) => ({ id: "report" })),
)

const find = (role: string, name?: string) =>
  Effect.tryPromise(() => screen.findByRole(role, name === undefined ? {} : { name }))

const findText = (text: string) => Effect.tryPromise(() => screen.findByText(text))

const gone = (role: string) =>
  Effect.tryPromise(async () => {
    const { waitFor } = await import("@testing-library/dom")

    await waitFor(() => expect(screen.queryByRole(role)).toBeNull())
  })

const labels = Effect.sync(() => screen.getAllByRole("listitem").map((node) => node.textContent))

const mount = <R>(component: View.Component<Record<never, never>, never, R>) =>
  Effect.gen(function* () {
    const target = yield* Effect.acquireRelease(
      Effect.sync(() => document.body.appendChild(document.createElement("div"))),
      (node) => Effect.sync(() => node.remove()),
    )

    const layer = Layer.succeedContext(yield* Effect.context<R>())

    yield* Effect.forkScoped(App.mount(component, { target, layer }), { startImmediately: true })
  })

const LoaderStory = pipe(
  LoaderPage.view,
  View.mapProps((_: Record<never, never>) => ({ title: "Sample title" })),
)

describe("rendering", () => {
  it.live("a component's pure view can be taken back out and shown with sample props", () =>
    Effect.gen(function* () {
      yield* mount(LoaderStory)

      expect((yield* find("heading", "Sample title")).textContent).toBe("Sample title")
      expect(LoaderPage.view).toBe(LoadedView)
    }),
  )

  it.live("a store change updates the bound text and keeps the surrounding nodes", () =>
    Effect.gen(function* () {
      const board = yield* Board
      const probe = yield* Probe

      yield* mount(BoardPanel)

      const total = yield* find("status", "Total")
      const button = yield* find("button", "Add item")

      yield* board.commands.added({ label: "From a command" })
      yield* Effect.sync(() => button.click())
      yield* findText("From the button")

      expect(total.textContent).toBe("2")
      expect(yield* find("status", "Total")).toBe(total)
      expect(yield* Ref.get(probe.mounts)).toBe(1)
    }).pipe(Effect.provide(layer)),
  )

  it.live("a keyed list keeps each row's node through renames, reorders and removals", () =>
    Effect.gen(function* () {
      const board = yield* Board

      yield* mount(BoardPanel)
      yield* board.commands.added({ label: "Alpha" })
      yield* board.commands.added({ label: "Beta" })

      const alpha = yield* findText("Alpha")
      const beta = yield* findText("Beta")

      yield* board.commands.renamed({ id: "item-1", label: "Alpha, renamed" })
      yield* board.commands.reversed()
      yield* findText("Alpha, renamed")

      expect(yield* labels).toEqual(["Beta", "Alpha, renamed"])
      expect(screen.getAllByRole("listitem")).toEqual([beta, alpha])

      yield* board.commands.removed({ id: "item-2" })
      yield* Effect.tryPromise(async () => {
        const { waitFor } = await import("@testing-library/dom")

        await waitFor(() => expect(screen.getAllByRole("listitem")).toEqual([alpha]))
      })
    }).pipe(Effect.provide(layer)),
  )

  it.live("a conditional mounts its component when shown and cancels its scope when hidden", () =>
    Effect.gen(function* () {
      const probe = yield* Probe

      yield* mount(Disclosure)

      const toggle = yield* find("button", "Toggle details")

      expect(screen.queryByRole("note")).toBeNull()

      yield* Effect.sync(() => toggle.click())

      expect((yield* find("note")).textContent).toBe("Now you see me")

      yield* Effect.sync(() => toggle.click())
      yield* gone("note")

      expect(yield* Ref.get(probe.mounts)).toBe(1)
      expect(yield* Ref.get(probe.unmounts)).toBe(1)
    }).pipe(Effect.provide(layer)),
  )

  it.live("a pending component shows its placeholder until the load succeeds", () =>
    Effect.gen(function* () {
      const probe = yield* Probe

      yield* mount(LoaderPage)

      expect((yield* find("status")).textContent).toBe("Loading report")

      yield* Deferred.succeed(probe.loaded, "Quarterly report")

      expect((yield* find("heading", "Quarterly report")).textContent).toBe("Quarterly report")
      expect(screen.queryByRole("status")).toBeNull()
    }).pipe(Effect.provide(layer)),
  )

  it.live("a failed load is shown by the view that recovers its error", () =>
    Effect.gen(function* () {
      const probe = yield* Probe

      yield* mount(LoaderPage)
      yield* Deferred.fail(probe.loaded, new LoadFailed({ message: "The report is missing." }))

      expect((yield* find("alert")).textContent).toBe("The report is missing.")
    }).pipe(Effect.provide(layer)),
  )
})
