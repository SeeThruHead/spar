import { Schema } from "effect"
import { Store } from "spar"
import { exclaimEveryTenth, makeRows, swapSecondAndSecondLast } from "../shared/rows.ts"
import type { Row as Shared } from "../shared/rows.ts"

export const Row = Schema.Struct({ id: Schema.Int, label: Schema.String })

const exclaimedMiddle = (rows: ReadonlyArray<Shared>): ReadonlyArray<Shared> => {
  const middle = Math.floor(rows.length / 2)

  return rows
    .slice(middle, middle + 1)
    .reduce((all, row) => Store.withRow(all, middle, { ...row, label: `${row.label} !!!` }), rows)
}

const Rows = Schema.Array(Row)

const State = Schema.Struct({ rows: Rows, selected: Schema.Int, nextId: Schema.Int })

type State = typeof State.Type

const initialState: State = { rows: [], selected: 0, nextId: 1 }

const Count = Schema.Struct({ count: Schema.Int })

const Target = Schema.Struct({ id: Schema.Int })

export class TableStore extends Store.Tag<TableStore>()("bench/TableStore", {
  state: State,
  initialState,
  actions: {
    created: Store.action(Count, (state: State, { count }) => ({
      rows: makeRows(count, state.nextId),
      selected: 0,
      nextId: state.nextId + count,
    })),
    appended: Store.action(Count, (state: State, { count }) => ({
      ...state,
      rows: [...state.rows, ...makeRows(count, state.nextId)],
      nextId: state.nextId + count,
    })),
    updated: Store.action(Schema.Void, (state: State) => ({
      ...state,
      rows: exclaimEveryTenth(state.rows),
    })),
    oneUpdated: Store.action(Schema.Void, (state: State) => ({
      ...state,
      rows: exclaimedMiddle(state.rows),
    })),
    swapped: Store.action(Schema.Void, (state: State) => ({
      ...state,
      rows: swapSecondAndSecondLast(state.rows),
    })),
    cleared: Store.action(Schema.Void, (state: State) => ({ ...state, rows: [], selected: 0 })),
    selected: Store.action(Target, (state: State, { id }) => ({ ...state, selected: id })),
    removed: Store.action(Target, (state: State, { id }) => ({
      ...state,
      rows: state.rows.filter((row) => row.id !== id),
    })),
  },
  selectors: {
    rows: Store.selector(Rows, (state: State) => state.rows),
    selected: Store.selector(Schema.Int, (state: State) => state.selected),
  },
}) {}
