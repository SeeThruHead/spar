import { Effect, Schema } from "effect"
import { Props, UiState, View } from "spar"

const hover = Effect.gen(function* () {
  const hovered = yield* UiState.make("hovered", Schema.Boolean, false)

  return {
    hovered,
    onEnter: UiState.set(hovered, true),
    onLeave: UiState.set(hovered, false),
  }
})

const hoverProps = {
  hovered: Props.Reactive(Schema.Boolean),
  onEnter: Props.Action,
  onLeave: Props.Action,
}

const CardView = View.make(
  "CardView",
  { title: Schema.String, ...hoverProps },
  ({ title, hovered, onEnter, onLeave }) => (
    <article
      class={{ card: true, raised: hovered }}
      onPointerenter={onEnter}
      onPointerleave={onLeave}
    >
      {title}
    </article>
  ),
)

export const Card = View.taking({ title: Schema.String }, ({ title }) =>
  Effect.map(hover, (hovering) => ({ title, ...hovering })),
)(CardView)

const AvatarView = View.make(
  "AvatarView",
  { name: Schema.String, ...hoverProps },
  ({ name, hovered, onEnter, onLeave }) => (
    <figure onPointerenter={onEnter} onPointerleave={onLeave}>
      <figcaption hidden={hovered}>{name}</figcaption>
    </figure>
  ),
)

export const Avatar = View.taking({ name: Schema.String }, ({ name }) =>
  Effect.map(hover, (hovering) => ({ name, ...hovering })),
)(AvatarView)
