import { Schema } from "effect"
import { UiState } from "spar"
import * as View from "./View.ts"

export const withHover = View.all(
  View.bind("hovered", () => UiState.make("hovered", Schema.Boolean, false)),
  View.let("onEnter", ({ hovered }) => UiState.set(hovered, true)),
  View.let("onLeave", ({ hovered }) => UiState.set(hovered, false)),
)

export const Card = View.compose(
  View.props({ title: Schema.String }),
  withHover,
)(({ title, hovered, onEnter, onLeave }) => (
  <article
    class={{ card: true, raised: hovered }}
    onPointerenter={onEnter}
    onPointerleave={onLeave}
  >
    {title}
  </article>
))

export const Avatar = View.compose(
  View.props({ name: Schema.String }),
  withHover,
)(({ name, hovered, onEnter, onLeave }) => (
  <figure onPointerenter={onEnter} onPointerleave={onLeave}>
    <figcaption hidden={hovered}>{name}</figcaption>
  </figure>
))
