import { UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"
import {
  exclaimEveryTenth,
  exclaimMiddle,
  makeRows,
  swapSecondAndSecondLast,
} from "../shared/rows.ts"
import type { Row } from "../shared/rows.ts"

const TableModel = Schema.Struct({
  rows: Schema.Array(Schema.Struct({ id: Schema.Int, label: Schema.String })),
  selected: Schema.Int,
  nextId: Schema.Int,
})

const TableMessage = UiSchema.TaggedEnum({
  ClickedCreate: { count: Schema.Int },
  ClickedAppend: { count: Schema.Int },
  ClickedUpdate: {},
  ClickedUpdateOne: {},
  ClickedClear: {},
  ClickedSwap: {},
  ClickedRow: { id: Schema.Int },
  ClickedRemove: { id: Schema.Int },
})

type TableMessage = typeof TableMessage.Type

const row = (h: Html.H<TableMessage>, item: Row, isSelected: boolean) =>
  h.tr
    .key(String(item.id))
    .class(isSelected && "danger")
    .children(
      h.td.class("col-md-1").children(String(item.id)),
      h.td.class("col-md-4").children(
        h.a
          .class("lbl")
          .on("click", TableMessage.ClickedRow({ id: item.id }))
          .children(item.label),
      ),
      h.td.class("col-md-1").children(
        h.a
          .class("remove")
          .on("click", TableMessage.ClickedRemove({ id: item.id }))
          .children("x"),
      ),
      h.td.class("col-md-6"),
    )

const button = (h: Html.H<TableMessage>, id: string, label: string, message: TableMessage) =>
  h.button.attr("id", id).on("click", message).children(label)

const Table = Html.component({
  name: "Table",
  model: TableModel,
  message: TableMessage,
}).make({
  init: () => ({ rows: [], selected: 0, nextId: 1 }),
  update: {
    ClickedCreate: ($, { count }) =>
      $.evolve({ rows: makeRows(count, $.model.nextId), selected: 0, nextId: (id) => id + count }),
    ClickedAppend: ($, { count }) =>
      $.evolve({
        rows: (rows) => [...rows, ...makeRows(count, $.model.nextId)],
        nextId: (id) => id + count,
      }),
    ClickedUpdate: ($) => $.evolve({ rows: exclaimEveryTenth }),
    ClickedUpdateOne: ($) => $.evolve({ rows: exclaimMiddle }),
    ClickedClear: ($) => $.evolve({ rows: [], selected: 0 }),
    ClickedSwap: ($) => $.evolve({ rows: swapSecondAndSecondLast }),
    ClickedRow: ($, { id }) => $.evolve({ selected: id }),
    ClickedRemove: ($, { id }) =>
      $.evolve({ rows: (rows) => rows.filter((item) => item.id !== id) }),
  },
  view: (h, model) =>
    h.div
      .attr("id", "main")
      .children(
        h.div
          .class("jumbotron")
          .children(
            h.h1.children("Effect UI"),
            button(h, "run", "Create 1,000 rows", TableMessage.ClickedCreate({ count: 1000 })),
            button(
              h,
              "runlots",
              "Create 10,000 rows",
              TableMessage.ClickedCreate({ count: 10_000 }),
            ),
            button(h, "add", "Append 1,000 rows", TableMessage.ClickedAppend({ count: 1000 })),
            button(h, "update", "Update every 10th row", TableMessage.ClickedUpdate()),
            button(h, "updateone", "Update one row", TableMessage.ClickedUpdateOne()),
            button(h, "clear", "Clear", TableMessage.ClickedClear()),
            button(h, "swaprows", "Swap rows", TableMessage.ClickedSwap()),
          ),
        h.table.children(
          h.tbody
            .attr("id", "tbody")
            .children(...model.rows.map((item) => h.lazy(row, item, item.id === model.selected))),
        ),
      ),
})

const root = document.getElementById("root")

const Main = root === null ? Layer.empty : BrowserHost.mount(Table, {}, root)

Layer.launch(Main).pipe(Effect.runFork)
