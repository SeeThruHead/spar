import { Effect, Schema } from "effect"
import {
  For,
  Reactive,
  UiState,
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

export const Resettable = compose(
  withUiState("name", Schema.String, "Ada"),
  withUiState("open", Schema.Boolean, true),
  withHandlers((props) => ({
    onReset: [UiState.set(props.name, ""), UiState.set(props.open, false)],
  })),
)((props) => (
  <section>
    <output aria-label="Name">{props.name}</output>
    <output aria-label="Open">{Reactive.map(props.open, String)}</output>
    <button onClick={props.onReset}>Reset</button>
  </section>
))

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

const Month = Schema.Literals(["2026-01", "2026-02"])

type Month = typeof Month.Type

export const Months = compose(
  withUiState("highlighted", Month, "2026-01"),
  withHandlers((props) => ({
    bars: [{ month: "2026-01" as const }, { month: "2026-02" as const }],
    onEnter: (month: Month) => UiState.set(props.highlighted, month),
  })),
)((props) => (
  <ul>
    <For each={props.bars} by={(bar) => bar.month}>
      {(_bar, month) => (
        <li>
          <button onFocus={props.onEnter(month)}>{month}</button>
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

const withLabel = Effect.fnUntraced(function* () {
  const label = yield* UiState.make("label", Schema.String, "")

  return { label }
})

export const Labelled = compose(
  withProps({}),
  withLabel,
  withHandlers((props) => ({ shown: Reactive.map(props.label, (now) => now.trim()) })),
)((props) => <p>{props.shown}</p>)

export const Grid = compose(
  withHandlers(() => ({
    rows: [{ month: "2026-01", cells: [{ key: "a", text: "1" }] }],
  })),
)((props) => (
  <table>
    <For each={props.rows} by={(row) => row.month}>
      {(row) => (
        <tr>
          <For each={Reactive.map(row, (now) => now.cells)} by={(cell) => cell.key}>
            {(cell) => <td>{Reactive.map(cell, (now) => now.text)}</td>}
          </For>
        </tr>
      )}
    </For>
  </table>
))
