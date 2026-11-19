import { Schema } from "effect"
import { Props, View } from "spar"

export const TabView = View.make(
  "TabView",
  {
    id: Schema.String,
    title: Schema.String,
    handle: Props.Handle,
    selected: Props.Reactive(Schema.Boolean),
    tabIndex: Props.Reactive(Schema.Finite),
    onSelect: Props.Handler("click"),
    onKey: Props.Handler("keydown"),
  },
  (props) => (
    <button
      ref={props.handle}
      type="button"
      role="tab"
      id={`${props.id}-tab`}
      aria-controls={`${props.id}-panel`}
      aria-selected={props.selected}
      tabIndex={props.tabIndex}
      onClick={props.onSelect}
      onKeydown={props.onKey}
    >
      {props.title}
    </button>
  ),
)

export const TabPanelView = View.make(
  "TabPanelView",
  { id: Schema.String, hidden: Props.Reactive(Schema.Boolean), content: Props.Element },
  ({ id, hidden, content }) => (
    <div
      role="tabpanel"
      id={`${id}-panel`}
      aria-labelledby={`${id}-tab`}
      hidden={hidden}
      tabIndex={0}
    >
      {content}
    </div>
  ),
)

export const TabsView = View.make(
  "TabsView",
  { label: Schema.String, tabs: Schema.Array(Props.Element), panels: Schema.Array(Props.Element) },
  ({ label, tabs, panels }) => (
    <div class="spar-tabs">
      <div role="tablist" aria-label={label}>
        {tabs}
      </div>
      {panels}
    </div>
  ),
)
