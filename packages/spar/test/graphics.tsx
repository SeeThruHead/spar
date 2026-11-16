import { Reactive } from "spar"
import type { Element } from "spar"
import type { Item } from "./views.tsx"

type BadgeProps = {
  readonly active: Reactive.Reactive<boolean>
  readonly tone: Reactive.Reactive<string | null>
  readonly label: string
}

export const BadgeView = ({ active, tone, label }: BadgeProps) => (
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
)

export const IconView = ({ size }: { readonly size: Reactive.Reactive<number> }) => (
  <svg viewBox="0 0 10 10" width={size} role="img" aria-label="Dot">
    <circle cx="5" cy="5" r="4" class={{ dot: true }} />
    <foreignObject>
      <p>Inside the drawing</p>
    </foreignObject>
  </svg>
)

export const PairView = ({ item }: { readonly item: Reactive.Reactive<Item> }) => (
  <>
    <dt>{Reactive.map(item, (current) => current.id)}</dt>
    <dd>{Reactive.map(item, (current) => current.label)}</dd>
  </>
)

export const GlossaryView = ({ rows }: { readonly rows: Element }) => (
  <dl aria-label="Glossary">{rows}</dl>
)

export const RowsView = ({ rows }: { readonly rows: Element }) => <ul aria-label="Rows">{rows}</ul>
