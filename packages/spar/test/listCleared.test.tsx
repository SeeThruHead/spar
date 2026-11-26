import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Context, Effect, Layer, Ref, Schema, pipe } from "effect"
import { SecureRandom } from "effect/crypto"
import { Props, Reactive, Store, View, compose, withProps } from "spar"
import { eventually, mount } from "spar/testing"

const Item = Schema.Struct({ id: Schema.String, label: Schema.String })

type Item = typeof Item.Type

const State = Schema.Struct({ items: Schema.Array(Item) })

type State = typeof State.Type

class Shelf extends Store.Tag<Shelf>()("test/Shelf", {
  state: State,
  initialState: { items: [] },
  actions: {
    shown: Store.action(
      Schema.Struct({ items: Schema.Array(Item) }),
      (_: State, { items }): State => ({ items }),
    ),
    cleared: Store.action(Schema.Void, (): State => ({ items: [] })),
  },
  selectors: { items: Store.selector(Schema.Array(Item), (state: State) => state.items) },
}) {}

class Closed extends Context.Service<Closed, Ref.Ref<number>>()("test/Closed") {
  static readonly layer = Layer.effect(Closed, Ref.make(0))
}

const layer = Layer.mergeAll(Shelf.layer, Closed.layer).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
)

const RowView = View.make(
  "RowView",
  { label: Props.Reactive(Schema.String), onPick: Props.Action },
  ({ label, onPick }) => (
    <li>
      <button onClick={onPick}>{label}</button>
    </li>
  ),
)

const Row = compose(
  withProps({ item: Props.Reactive(Item) }),
  Effect.fnUntraced(function* ({ item }) {
    const closed = yield* Closed

    yield* Effect.addFinalizer(() => Ref.update(closed, (count) => count + 1))

    return { label: Reactive.map(item, (current) => current.label), onPick: Effect.void }
  }),
)(RowView)

const AloneView = View.make("AloneView", { rows: Props.Element }, ({ rows }) => (
  <ul aria-label="Alone">{rows}</ul>
))

const BetweenView = View.make("BetweenView", { rows: Props.Element }, ({ rows }) => (
  <ul aria-label="Between">
    <li>First</li>
    {rows}
    <li>Last</li>
  </ul>
))

const rowsOf = Effect.gen(function* () {
  const shelf = yield* Shelf

  return {
    rows: yield* pipe(
      shelf.select.items,
      Reactive.mapBy(
        (item: Item) => item.id,
        Row,
        (item) => ({ item }),
      ),
    ),
  }
})

const shelfRows = Effect.fnUntraced(function* () {
  return yield* rowsOf
})

const Alone = compose(shelfRows)(AloneView)

const Between = compose(shelfRows)(BetweenView)

const items = (...ids: ReadonlyArray<string>): ReadonlyArray<Item> =>
  ids.map((id) => ({ id, label: `Row ${id}` }))

const texts = (): ReadonlyArray<string | null> =>
  screen.getAllByRole("listitem").map((node) => node.textContent)

describe("a keyed list that loses every row", () => {
  it.live("empties a parent it has to itself, closes each row and fills again", () =>
    Effect.gen(function* () {
      const shelf = yield* Shelf
      const closed = yield* Closed

      yield* mount(Alone)
      yield* shelf.commands.shown({ items: items("a", "b", "c") })
      yield* eventually(() => expect(texts()).toEqual(["Row a", "Row b", "Row c"]))
      yield* shelf.commands.cleared()
      yield* eventually(() => expect(screen.queryAllByRole("listitem")).toEqual([]))

      expect(yield* Ref.get(closed)).toBe(3)

      yield* shelf.commands.shown({ items: items("d", "e") })
      yield* eventually(() => expect(texts()).toEqual(["Row d", "Row e"]))
    }).pipe(Effect.provide(layer)),
  )

  it.live("removes only its own rows when the parent holds other nodes too", () =>
    Effect.gen(function* () {
      const shelf = yield* Shelf
      const closed = yield* Closed

      yield* mount(Between)
      yield* shelf.commands.shown({ items: items("a", "b", "c") })
      yield* eventually(() => expect(texts()).toEqual(["First", "Row a", "Row b", "Row c", "Last"]))
      yield* shelf.commands.shown({ items: items("x", "y") })
      yield* eventually(() => expect(texts()).toEqual(["First", "Row x", "Row y", "Last"]))

      expect(yield* Ref.get(closed)).toBe(3)

      yield* shelf.commands.cleared()
      yield* eventually(() => expect(texts()).toEqual(["First", "Last"]))
      yield* shelf.commands.shown({ items: items("z") })
      yield* eventually(() => expect(texts()).toEqual(["First", "Row z", "Last"]))
    }).pipe(Effect.provide(layer)),
  )
})
