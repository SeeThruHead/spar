import { Schema } from "effect"
import { Props } from "spar"
import * as View from "./View.ts"

export const Dropdown = View.compose(
  View.props({
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  }),
  View.uiState("open", Schema.Boolean, false),
  View.onKey("Escape", (props) => props.open.set(false)),
)((props) => (
  <div class="dropdown">
    <button aria-expanded={props.open} onClick={props.open.toggle}>
      {props.label}
    </button>
    {props.open.when(
      <ul role="menu">
        {props.items.map((item) => (
          <li role="menuitem" onClick={[props.onPick(item), props.open.set(false)]}>
            {item}
          </li>
        ))}
      </ul>,
    )}
  </div>
))

export const Toolbar = View.compose(
  View.uiState("sort", Schema.String, "Newest"),
  View.child("sorting", Dropdown, (props) => ({
    label: "Sort by",
    items: ["Newest", "Oldest", "Largest"],
    onPick: props.sort.set,
  })),
)((props) => (
  <header>
    {props.sorting}
    <output>{props.sort}</output>
  </header>
))
