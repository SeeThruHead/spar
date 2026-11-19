import { Schema } from "effect"
import { Runtime } from "foldkit"
import type { Update } from "foldkit"
import { createKeyedLazy } from "foldkit/html"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  exclaimEveryTenth,
  exclaimMiddle,
  makeRows,
  swapSecondAndSecondLast,
} from "../shared/rows.ts"

const Row = Schema.Struct({ id: Schema.Int, label: Schema.String })

type Row = typeof Row.Type

export const Model = Schema.Struct({
  rows: Schema.Array(Row),
  selected: Schema.Int,
  nextId: Schema.Int,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedCreate: { count: Schema.Int },
  ClickedAppend: { count: Schema.Int },
  ClickedUpdate: {},
  ClickedUpdateOne: {},
  ClickedClear: {},
  ClickedSwap: {},
  ClickedRow: { id: Schema.Int },
  ClickedRemove: { id: Schema.Int },
})

export type Message = typeof Message.Type

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedCreate: ({ count }) => ({
      model: {
        rows: makeRows(count, model.nextId),
        selected: 0,
        nextId: model.nextId + count,
      },
    }),
    ClickedAppend: ({ count }) => ({
      model: {
        ...model,
        rows: [...model.rows, ...makeRows(count, model.nextId)],
        nextId: model.nextId + count,
      },
    }),
    ClickedUpdate: () => ({ model: { ...model, rows: exclaimEveryTenth(model.rows) } }),
    ClickedUpdateOne: () => ({ model: { ...model, rows: exclaimMiddle(model.rows) } }),
    ClickedClear: () => ({ model: { ...model, rows: [], selected: 0 } }),
    ClickedSwap: () => ({ model: { ...model, rows: swapSecondAndSecondLast(model.rows) } }),
    ClickedRow: ({ id }) => ({ model: { ...model, selected: id } }),
    ClickedRemove: ({ id }) => ({
      model: { ...model, rows: model.rows.filter((row) => row.id !== id) },
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { rows: [], selected: 0, nextId: 1 },
})

const lazyRow = createKeyedLazy()

const rowView = (h: HtmlBuilder<Message>, row: Row, isSelected: boolean): Html =>
  h.keyed("tr")(
    String(row.id),
    [h.Class(isSelected ? "danger" : "")],
    [
      h.td([h.Class("col-md-1")], [String(row.id)]),
      h.td(
        [h.Class("col-md-4")],
        [h.a([h.Class("lbl"), h.OnClick(Message.ClickedRow({ id: row.id }))], [row.label])],
      ),
      h.td(
        [h.Class("col-md-1")],
        [h.a([h.Class("remove"), h.OnClick(Message.ClickedRemove({ id: row.id }))], ["x"])],
      ),
      h.td([h.Class("col-md-6")], []),
    ],
  )

const button = (h: HtmlBuilder<Message>, id: string, label: string, message: Message): Html =>
  h.button([h.Id(id), h.OnClick(message)], [label])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Foldkit bench",
  body: h.div(
    [h.Id("main")],
    [
      h.div(
        [h.Class("jumbotron")],
        [
          h.h1([], ["Foldkit"]),
          button(h, "run", "Create 1,000 rows", Message.ClickedCreate({ count: 1000 })),
          button(h, "runlots", "Create 10,000 rows", Message.ClickedCreate({ count: 10_000 })),
          button(h, "add", "Append 1,000 rows", Message.ClickedAppend({ count: 1000 })),
          button(h, "update", "Update every 10th row", Message.ClickedUpdate()),
          button(h, "updateone", "Update one row", Message.ClickedUpdateOne()),
          button(h, "clear", "Clear", Message.ClickedClear()),
          button(h, "swaprows", "Swap rows", Message.ClickedSwap()),
        ],
      ),
      h.table(
        [],
        [
          h.tbody(
            [h.Id("tbody")],
            model.rows.map((row) =>
              lazyRow(String(row.id), rowView, [h, row, row.id === model.selected]),
            ),
          ),
        ],
      ),
    ],
  ),
})

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById("root"),
})

Runtime.run(application)
