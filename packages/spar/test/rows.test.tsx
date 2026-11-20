import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Schema } from "effect"
import { For, Reactive, Store, compose, withStore } from "spar"
import * as Testing from "spar/testing"
import * as Cell from "../src/internal/cell.ts"
import { changedOne } from "../src/internal/rows.ts"

const Row = Schema.Struct({ id: Schema.String, label: Schema.String })

type Row = typeof Row.Type

const State = Schema.Struct({ rows: Schema.Array(Row) })

type State = typeof State.Type

const first: ReadonlyArray<Row> = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
]

class Listed extends Store.Tag<Listed>()("test/Listed", {
  state: State,
  initialState: { rows: first },
  actions: {
    renamed: Store.action(
      Schema.Struct({ at: Schema.Int, label: Schema.String }),
      (state: State, { at, label }): State => ({
        rows: state.rows
          .slice(at, at + 1)
          .reduce((rows, row) => Store.withRow(rows, at, { ...row, label }), state.rows),
      }),
    ),
    renamedInACopy: Store.action(
      Schema.Struct({ at: Schema.Int, label: Schema.String }),
      (state: State, { at, label }): State => ({
        rows: state.rows.map((row, index) => (index === at ? { ...row, label } : row)),
      }),
    ),
    replaced: Store.action(
      Schema.Struct({ at: Schema.Int, id: Schema.String }),
      (state: State, { at, id }): State => ({
        rows: Store.withRow(state.rows, at, { id, label: id.toUpperCase() }),
      }),
    ),
  },
  selectors: { rows: Store.selector(Schema.Array(Row), (state: State) => state.rows) },
}) {}

const List = compose(withStore(Listed, (store) => ({ rows: store.select.rows })))((props) => (
  <ul>
    <For each={props.rows} by={(row) => row.id}>
      {(row) => <li>{Reactive.map(row, (now) => now.label)}</li>}
    </For>
  </ul>
))

const keyed = Cell.make(0)

const Counted = compose(withStore(Listed, (store) => ({ rows: store.select.rows })))((props) => (
  <ul>
    <For
      each={props.rows}
      by={(row) => {
        keyed.write(keyed.read() + 1)

        return row.id
      }}
    >
      {(row) => <li>{Reactive.map(row, (now) => now.label)}</li>}
    </For>
  </ul>
))

const keysSince = (before: number) => keyed.read() - before

const labels = () => screen.getAllByRole("listitem").map((item) => item.textContent)

describe("a row a store changed with Store.withRow", () => {
  it("is known to be the only change, but only against the array it was made from", () => {
    const next = Store.withRow(first, 1, { id: "b", label: "Bee" })
    const later = Store.withRow(next, 2, { id: "c", label: "Sea" })

    expect(changedOne(first, next)).toBe(1)
    expect(changedOne(next, later)).toBe(2)
    expect(changedOne(first, later)).toBeUndefined()
    expect(changedOne(first, [...next])).toBeUndefined()
  })

  it.live(
    "is the only row the list touches, and a row replaced by another key is drawn again",
    () =>
      Effect.gen(function* () {
        const store = yield* Listed

        yield* Testing.mount(List)
        yield* Testing.findText("Gamma")

        const [, beta] = screen.getAllByRole("listitem")

        yield* store.commands.renamed({ at: 1, label: "Bee" })
        yield* Testing.eventually(() => expect(labels()).toEqual(["Alpha", "Bee", "Gamma"]))
        expect(screen.getAllByRole("listitem")[1]).toBe(beta)

        yield* store.commands.replaced({ at: 0, id: "z" })
        yield* Testing.eventually(() => expect(labels()).toEqual(["Z", "Bee", "Gamma"]))
      }).pipe(Effect.provide(Listed.layer)),
  )

  it.live("asks for the key of the changed row only, with withRow or in a copy", () =>
    Effect.gen(function* () {
      const store = yield* Listed

      yield* Testing.mount(Counted)
      yield* Testing.findText("Gamma")

      const before = keyed.read()

      yield* store.commands.renamed({ at: 1, label: "Bee" })
      yield* Testing.eventually(() => expect(labels()).toEqual(["Alpha", "Bee", "Gamma"]))
      expect(keysSince(before)).toBe(1)

      const copied = keyed.read()

      yield* store.commands.renamedInACopy({ at: 2, label: "Sea" })
      yield* Testing.eventually(() => expect(labels()).toEqual(["Alpha", "Bee", "Sea"]))
      expect(keysSince(copied)).toBe(1)
    }).pipe(Effect.provide(Listed.layer)),
  )
})
