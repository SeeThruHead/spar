import { Schema } from "effect"
import { Props, View } from "spar"

export const SegmentView = View.make(
  "SegmentView",
  {
    kind: Schema.String,
    label: Props.Reactive(Schema.String),
    status: Props.Reactive(Schema.String),
    inner: Props.Element,
  },
  (props) => (
    <section class="segment" aria-label={props.kind}>
      <p>
        <strong>{props.kind}</strong>{" "}
        <output aria-label={`${props.kind} name`}>{props.label}</output>{" "}
        <output aria-label={`${props.kind} status`}>{props.status}</output>
      </p>
      {props.inner}
    </section>
  ),
)

export const ReportView = View.make(
  "ReportView",
  {
    label: Props.Reactive(Schema.String),
    status: Props.Reactive(Schema.String),
    author: Props.Reactive(Schema.String),
    authorStatus: Props.Reactive(Schema.String),
  },
  (props) => (
    <section class="segment" aria-label="Report">
      <h1>
        <output aria-label="Report name">{props.label}</output>
      </h1>
      <p>
        <output aria-label="Report status">{props.status}</output>
      </p>
      <p>
        Written by <output aria-label="Author name">{props.author}</output>{" "}
        <output aria-label="Author status">{props.authorStatus}</output>
      </p>
    </section>
  ),
)

export const DeepMissingView = View.make("DeepMissingView", { path: Schema.String }, ({ path }) => (
  <p>Nothing more at {path}.</p>
))
