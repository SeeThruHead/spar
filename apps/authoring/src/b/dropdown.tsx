import { Schema } from "effect"
import { Events, Props, Reactive, UiState } from "spar"
import * as View from "./View.ts"

export const Dropdown = View.compose(
  View.props({
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  }),
  View.bind("open", () => UiState.make("open", Schema.Boolean, false)),
  View.tap(({ open }) =>
    Events.onWindow("keydown", (event) => (event.key === "Escape" ? UiState.set(open, false) : [])),
  ),
)(({ label, items, onPick, open }) => (
  <div class="dropdown">
    <button aria-expanded={open} onClick={UiState.update(open, (shown) => !shown)}>
      {label}
    </button>
    <ul role="menu" hidden={Reactive.map(open, (shown) => !shown)}>
      {items.map((item) => (
        <li role="menuitem" onClick={[onPick(item), UiState.set(open, false)]}>
          {item}
        </li>
      ))}
    </ul>
  </div>
))

export const Toolbar = View.compose(
  View.bind("sort", () => UiState.make("sort", Schema.String, "Newest")),
  View.bind("sorting", ({ sort }) =>
    View.child(Dropdown, {
      label: "Sort by",
      items: ["Newest", "Oldest", "Largest"],
      onPick: (item: string) => UiState.set(sort, item),
    }),
  ),
)(({ sort, sorting }) => (
  <header>
    {sorting}
    <output>{sort}</output>
  </header>
))
