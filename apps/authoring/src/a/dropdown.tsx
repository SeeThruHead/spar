import { Schema } from "effect"
import { Props, Reactive, UiState } from "spar"
import { compose, withChild, withKey, withProps, withUiState } from "./api.ts"

export const Dropdown = compose(
  withProps({
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  }),
  withUiState("open", Schema.Boolean, false),
  withKey("Escape", (props) => UiState.set(props.open, false)),
)((props) => (
  <div class="dropdown">
    <button aria-expanded={props.open} onClick={UiState.update(props.open, (open) => !open)}>
      {props.label}
    </button>
    <ul role="menu" hidden={Reactive.map(props.open, (open) => !open)}>
      {props.items.map((item) => (
        <li role="menuitem" onClick={[props.onPick(item), UiState.set(props.open, false)]}>
          {item}
        </li>
      ))}
    </ul>
  </div>
))

export const Toolbar = compose(
  withUiState("sort", Schema.String, "Newest"),
  withChild("sorting", Dropdown, (props) => ({
    label: "Sort by",
    items: ["Newest", "Oldest", "Largest"],
    onPick: (item: string) => UiState.set(props.sort, item),
  })),
)((props) => (
  <header>
    {props.sorting}
    <output>{props.sort}</output>
  </header>
))
