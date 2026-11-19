import { Schema } from "effect"
import { Handle, Props, View } from "spar"
import type { Handler, Reactive } from "spar"

type TabProps = {
  readonly id: string
  readonly title: string
  readonly handle: Handle.Handle
  readonly selected: Reactive.Reactive<boolean>
  readonly tabIndex: Reactive.Reactive<number>
  readonly onSelect: Handler<Event>
  readonly onKey: Handler<KeyboardEvent>
}

export const TabView = (props: TabProps) => (
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
