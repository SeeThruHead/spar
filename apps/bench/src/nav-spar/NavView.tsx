import { Schema } from "effect"
import { Props, Router, View } from "spar"

export const SegmentView = View.make(
  "SegmentView",
  { kind: Schema.String, label: Props.Reactive(Schema.String), inner: Props.Element },
  ({ kind, label, inner }) => (
    <section>
      <p>
        {kind} <output data-kind={kind}>{label}</output>
      </p>
      {inner}
    </section>
  ),
)

export const ReportView = View.make(
  "ReportView",
  { label: Props.Reactive(Schema.String), author: Props.Reactive(Schema.String) },
  ({ label, author }) => (
    <section>
      <h1>{label}</h1>
      <p>
        Written by <output id="author">{author}</output>
      </p>
    </section>
  ),
)

export const HomeView = View.make("HomeView", { go: Router.Link }, ({ go }) => (
  <p>
    <a id="go" href={go.href} onClick={go.onClick}>
      Open the report
    </a>
  </p>
))

export const NothingView = View.make("NothingView", { path: Schema.String }, ({ path }) => (
  <p>Nothing at {path}</p>
))

export const ShellView = View.make("ShellView", { page: Props.Element }, ({ page }) => (
  <main>{page}</main>
))
