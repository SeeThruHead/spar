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

export const DeepMissingView = View.make("DeepMissingView", { path: Schema.String }, ({ path }) => (
  <p>Nothing more at {path}.</p>
))
