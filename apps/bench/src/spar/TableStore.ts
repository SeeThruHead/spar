import { Schema } from "effect"
import { Store } from "spar"
import { exclaimEveryTenth, makeRows, swapSecondAndSecondLast } from "../shared/rows.ts"
import type { Row } from "../shared/rows.ts"

type State = {
  readonly rows: ReadonlyArray<Row>
  readonly selected: number
  readonly nextId: number
}

const initialState: State = { rows: [], selected: 0, nextId: 1 }

const Count = Schema.Struct({ count: Schema.Int })

const Target = Schema.Struct({ id: Schema.Int })

export class TableStore extends Store.Tag<TableStore>()("bench/TableStore", {
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
    rows: (state) => state.rows,
    selected: (state) => state.selected,
  },
}) {}
