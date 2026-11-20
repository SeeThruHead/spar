import { Effect, Schema, pipe } from "effect"
import { Events, Props, Reactive, UiState, View } from "spar"

const ItemView = View.make(
  "ItemView",
  { text: Props.Reactive(Schema.String), onPick: Props.Action },
  ({ text, onPick }) => (
    <li role="menuitem" onClick={onPick}>
      {text}
    </li>
  ),
)

const DropdownView = View.make(
  "DropdownView",
  {
    label: Schema.String,
    open: Props.State(Schema.Boolean),
    items: Props.Element,
  },
  ({ label, open, items }) => (
    <div class="dropdown">
      <button aria-expanded={open} onClick={UiState.update(open, (shown) => !shown)}>
        {label}
      </button>
      <ul role="menu" hidden={Reactive.map(open, (shown) => !shown)}>
        {items}
      </ul>
    </div>
  ),
)

export const Dropdown = View.taking(
  {
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  },
  Effect.fnUntraced(function* ({ label, items, onPick }) {
    const open = yield* UiState.make("open", Schema.Boolean, false)

    yield* Events.onWindow("keydown", (event) =>
      event.key === "Escape" ? UiState.set(open, false) : [],
    )

    return {
      label,
      open,
      items: yield* pipe(
        Reactive.succeed(items),
        Reactive.mapBy(
          (item: string) => item,
          ItemView,
          (item, key) => ({ text: item, onPick: [onPick(key), UiState.set(open, false)] }),
        ),
      ),
    }
  }),
)(DropdownView)

const ToolbarView = View.make(
  "ToolbarView",
  { sorting: Props.Element, sort: Props.Reactive(Schema.String) },
  ({ sorting, sort }) => (
    <header>
      {sorting}
      <output>{sort}</output>
    </header>
  ),
)

export const Toolbar = View.connect(
  Effect.fnUntraced(function* () {
    const sort = yield* UiState.make("sort", Schema.String, "Newest")

    return {
      sort,
      sorting: yield* View.child(Dropdown, {
        label: "Sort by",
        items: ["Newest", "Oldest", "Largest"],
        onPick: (item: string) => UiState.set(sort, item),
      }),
    }
  }),
)(ToolbarView)
