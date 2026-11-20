import { Schema } from "effect"
import * as View from "./View.ts"

export const withHover = View.uiState("hovered", Schema.Boolean, false)

export const Card = View.compose(
  View.props({ title: Schema.String }),
  withHover,
)((props) => (
  <article
    class={{ card: true, raised: props.hovered }}
    onPointerenter={props.hovered.set(true)}
    onPointerleave={props.hovered.set(false)}
  >
    {props.title}
  </article>
))

export const Avatar = View.compose(
  View.props({ name: Schema.String }),
  withHover,
)((props) => (
  <figure onPointerenter={props.hovered.set(true)} onPointerleave={props.hovered.set(false)}>
    <figcaption hidden={props.hovered}>{props.name}</figcaption>
  </figure>
))
