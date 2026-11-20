import { Effect, Schema } from "effect"
import {
  For,
  Reactive,
  compose,
  withEffect,
  withEffectProps,
  withHandlers,
  withKey,
  withProps,
  withUiState,
} from "spar"

export const Dialog = compose(
  withHandlers(() => ({ title: "Draft", initial: Reactive.succeed("seen"), onClose: Effect.void })),
  withKey("Escape", (props) => props.onClose),
  withEffect((props) => Effect.as(props.initial.get, undefined)),
  withEffectProps(
    Effect.fnUntraced(function* (props) {
      const initial = yield* props.initial.get

      return { first: initial }
    }),
  ),
  withHandlers((props) => ({ heading: props.title.toUpperCase() })),
)((props) => (
  <section aria-label={props.title}>
    <h2>{props.heading}</h2>
    <p>{props.first}</p>
  </section>
))

const withGreeting = compose(
  withProps({ name: Schema.String }),
  withHandlers((props) => ({ greeting: `Hello ${props.name}` })),
)

export const Greeter = compose(
  withGreeting,
  withHandlers((props) => ({ loud: props.greeting.toUpperCase() })),
)((props) => <p>{props.loud}</p>)

export const Numbered = compose(
  withHandlers(() => ({
    rows: [
      { id: 1, name: "first" },
      { id: 2, name: "second" },
    ],
  })),
)((props) => (
  <ul>
    <For each={props.rows} by={(row) => row.id}>
      {(row, key) => (
        <li>
          {key} {Reactive.map(row, (now) => now.name)}
        </li>
      )}
    </For>
  </ul>
))

export const Ten = compose(
  withHandlers(() => ({ a: "ten" })),
  withHandlers((props) => ({ b: props.a })),
  withHandlers((props) => ({ c: props.b })),
  withHandlers((props) => ({ d: props.c })),
  withHandlers((props) => ({ e: props.d })),
  withHandlers((props) => ({ f: props.e })),
  withHandlers((props) => ({ g: props.f })),
  withHandlers((props) => ({ h: props.g })),
  withUiState("open", Schema.Boolean, false),
  withHandlers((props) => ({ i: props.h, shown: props.open })),
)((props) => <p hidden={Reactive.map(props.shown, (open) => open)}>{props.i}</p>)
