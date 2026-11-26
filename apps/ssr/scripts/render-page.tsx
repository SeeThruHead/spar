import { Effect, Layer, Schema, pipe } from "effect"
import { Props, Reactive, Renderer, Server, Store, View, compose } from "spar"

const Row = Schema.Struct({ id: Schema.Int, label: Schema.String })

const Rows = Schema.Struct({ rows: Schema.Array(Row) })

type Rows = typeof Rows.Type

class Table extends Store.Tag<Table>()("render-time/Table", {
  state: Rows,
  initialState: {
    rows: Array.from({ length: 1000 }, (_, index) => ({ id: index, label: `Row ${index}` })),
  },
  actions: {},
  selectors: { rows: Store.selector(Schema.Array(Row), (state: Rows) => state.rows) },
}) {}

const RowView = View.make("RowView", { row: Props.Reactive(Row) }, ({ row }) => (
  <li class="row">{Reactive.map(row, (now) => now.label)}</li>
))

const PageView = View.make("PageView", { rows: Props.Element }, ({ rows }) => (
  <main>
    <h1>Rows</h1>
    <ul>{rows}</ul>
  </main>
))

const Page = compose(
  Effect.fnUntraced(function* () {
    const table = yield* Table
    const rows = yield* pipe(
      table.select.rows,
      Reactive.mapBy(
        (row: typeof Row.Type) => String(row.id),
        RowView,
        (row) => ({ row }),
      ),
    )

    return { rows }
  }),
)(PageView)

export const rendered = Server.renderToString(Page, {
  layer: Layer.merge(Table.layer, Renderer.html),
})
