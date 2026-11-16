import type { Element, Handle, Handler, Reactive } from "spar"

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

type PanelProps = {
  readonly id: string
  readonly hidden: Reactive.Reactive<boolean>
  readonly content: Element
}

export const TabPanelView = ({ id, hidden, content }: PanelProps) => (
  <div
    role="tabpanel"
    id={`${id}-panel`}
    aria-labelledby={`${id}-tab`}
    hidden={hidden}
    tabIndex={0}
  >
    {content}
  </div>
)

type TabsProps = {
  readonly label: string
  readonly tabs: ReadonlyArray<Element>
  readonly panels: ReadonlyArray<Element>
}

export const TabsView = ({ label, tabs, panels }: TabsProps) => (
  <div class="spar-tabs">
    <div role="tablist" aria-label={label}>
      {tabs}
    </div>
    {panels}
  </div>
)
