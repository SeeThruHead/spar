import { Schema } from "effect"
import { UiState } from "spar"
import { all, compose, withHandlers, withProps, withUiState } from "./api.ts"

export const withHover = all(
  withUiState("hovered", Schema.Boolean, false),
  withHandlers((props) => ({
    onEnter: UiState.set(props.hovered, true),
    onLeave: UiState.set(props.hovered, false),
  })),
)

export const Card = compose(
  withProps({ title: Schema.String }),
  withHover,
)((props) => (
  <article
    class={{ card: true, raised: props.hovered }}
    onPointerenter={props.onEnter}
    onPointerleave={props.onLeave}
  >
    {props.title}
  </article>
))

export const Avatar = compose(
  withProps({ name: Schema.String }),
  withHover,
)((props) => (
  <figure onPointerenter={props.onEnter} onPointerleave={props.onLeave}>
    <figcaption hidden={props.hovered}>{props.name}</figcaption>
  </figure>
))
