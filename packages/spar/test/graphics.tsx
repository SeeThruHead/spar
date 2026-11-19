import { Schema } from "effect"
import { Props, Reactive, View } from "spar"
import { Item } from "./views.tsx"

export const BadgeView = View.make(
  "BadgeView",
  {
    active: Props.Reactive(Schema.Boolean),
    tone: Props.Reactive(Schema.NullOr(Schema.String)),
    label: Schema.String,
  },
  ({ active, tone, label }) => (
    <button
      class={{ badge: true, "is-active is-loud": active }}
      style={{ color: tone, fontWeight: "bold", "--gap": 4 }}
      aria-pressed={active}
      data-selected={active}
      data-kind="badge"
      data-tone={tone}
      title={label}
    >
      <span class="badge-label">{label}</span>
    </button>
  ),
)

export const IconView = View.make(
  "IconView",
  { size: Props.Reactive(Schema.Finite) },
  ({ size }) => (
    <svg viewBox="0 0 10 10" width={size} role="img" aria-label="Dot">
      <circle cx="5" cy="5" r="4" class={{ dot: true }} />
      <foreignObject>
        <p>Inside the drawing</p>
      </foreignObject>
    </svg>
  ),
)

export const PairView = View.make("PairView", { item: Props.Reactive(Item) }, ({ item }) => (
  <>
    <dt>{Reactive.map(item, (current) => current.id)}</dt>
    <dd>{Reactive.map(item, (current) => current.label)}</dd>
  </>
))

export const GlossaryView = View.make("GlossaryView", { rows: Props.Element }, ({ rows }) => (
  <dl aria-label="Glossary">{rows}</dl>
))

export const RowsView = View.make("RowsView", { rows: Props.Element }, ({ rows }) => (
  <ul aria-label="Rows">{rows}</ul>
))
