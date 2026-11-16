import { Effect, pipe } from "effect"
import { Reactive, View } from "spar"
import type { Row } from "../shared/rows.ts"
import { TableStore } from "./TableStore.ts"
import { RowView, TableView } from "./TableView.tsx"

export const Table = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* TableStore
    const rows = yield* pipe(
      store.select.rows,
      Reactive.mapBy(
        (row: Row) => String(row.id),
        RowView,
        (row, id) => ({
          id,
          row,
          selected: Reactive.map(store.select.selected, (selected) => String(selected) === id),
          onSelect: store.commands.selected({ id: Number(id) }),
          onRemove: store.commands.removed({ id: Number(id) }),
        }),
      ),
    )

    return {
      rows,
      onRun: store.commands.created({ count: 1000 }),
      onRunLots: store.commands.created({ count: 10_000 }),
      onAdd: store.commands.appended({ count: 1000 }),
      onUpdate: store.commands.updated(),
      onClear: store.commands.cleared(),
      onSwap: store.commands.swapped(),
    }
  }),
)(TableView)
