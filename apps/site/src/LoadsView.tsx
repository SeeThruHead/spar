import { Schema } from "effect"
import { Props, View } from "spar"

export const LoadRowView = View.make(
  "LoadRowView",
  {
    name: Schema.String,
    note: Schema.String,
    status: Props.Reactive(Schema.String),
    took: Props.Reactive(Schema.String),
    left: Props.Reactive(Schema.String),
    width: Props.Reactive(Schema.String),
  },
  ({ name, note, status, took, left, width }) => (
    <li class="load-row" data-status={status}>
      <span class="load-name">{name}</span>
      <span class="load-note">{note}</span>
      <span class="load-track">
        <span class="load-bar" style={{ marginInlineStart: left, inlineSize: width }} />
      </span>
      <output class="load-took" aria-label={`${name} took`}>
        {took}
      </output>
    </li>
  ),
)

export const LoadsView = View.make(
  "LoadsView",
  {
    rows: Schema.Array(Props.Element),
    summary: Props.Reactive(Schema.String),
    onRun: Props.Action,
  },
  ({ rows, summary, onRun }) => (
    <section class="demo" aria-label="Live example: three requests">
      <p class="demo-label">Live example</p>
      <p>
        <button type="button" class="spar-button spar-primary" onClick={onRun}>
          Load the page
        </button>
      </p>
      <ul class="loads">{rows}</ul>
      <p>
        <output aria-label="What happened">{summary}</output>
      </p>
      <p class="hint">
        The profile and the orders start together. The suggestions need the profile, so they start
        when it lands and not before. Nothing in the component says when to fetch. Turn on the
        devtools in the top bar and press again to see the same thing as a trace.
      </p>
    </section>
  ),
)
