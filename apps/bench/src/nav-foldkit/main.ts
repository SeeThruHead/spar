import { Effect, Schema } from "effect"
import { Runtime } from "foldkit"
import type { Update } from "foldkit"
import * as Command from "foldkit/command"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { lookup, target } from "../nav-shared/lookup.ts"

export const Model = Schema.Struct({
  page: Schema.Literals(["home", "report"]),
  labels: Schema.Record(Schema.String, Schema.String),
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedOpenReport: {},
  SucceededLookup: {
    kind: Schema.String,
    label: Schema.String,
    authorId: Schema.NullOr(Schema.String),
  },
})

export type Message = typeof Message.Type

const Lookup = Command.define("Lookup", {
  args: { kind: Schema.String, id: Schema.String },
  messages: [Message.SucceededLookup],
  execute: ({ kind, id }) =>
    Effect.map(
      Effect.promise(() => lookup(kind, id)),
      (found) => Message.SucceededLookup({ kind, label: found.label, authorId: found.authorId }),
    ),
})

const authorOf = (authorId: string | null) =>
  authorId === null ? [] : [Lookup({ kind: "author", id: authorId })]

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedOpenReport: () => ({
      model: { ...model, page: "report" },
      commands: [
        Lookup({ kind: "org", id: target.org }),
        Lookup({ kind: "team", id: target.team }),
        Lookup({ kind: "member", id: target.member }),
        Lookup({ kind: "reports", id: target.member }),
        Lookup({ kind: "report", id: target.report }),
      ],
    }),
    SucceededLookup: ({ kind, label, authorId }) => ({
      model: { ...model, labels: { ...model.labels, [kind]: label } },
      commands: authorOf(authorId),
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { page: "home", labels: {} },
})

const segment = (h: HtmlBuilder<Message>, model: Model, kind: string, inner: Html): Html =>
  h.section([], [h.p([], [`${kind} `, h.output([], [model.labels[kind] ?? ""])]), inner])

const report = (h: HtmlBuilder<Message>, model: Model): Html =>
  h.section(
    [],
    [
      h.h1([], [model.labels["report"] ?? ""]),
      h.p([], ["Written by ", h.output([h.Id("author")], [model.labels["author"] ?? ""])]),
    ],
  )

const home = (h: HtmlBuilder<Message>): Html =>
  h.p([], [h.button([h.Id("go"), h.OnClick(Message.ClickedOpenReport())], ["Open the report"])])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Foldkit navigation",
  body: h.main(
    [],
    [
      model.page === "home"
        ? home(h)
        : segment(
            h,
            model,
            "org",
            segment(
              h,
              model,
              "team",
              segment(h, model, "member", segment(h, model, "reports", report(h, model))),
            ),
          ),
    ],
  ),
})

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById("root") ?? document.body,
})

Runtime.run(application)
