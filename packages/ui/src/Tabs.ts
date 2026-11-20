import { Array, Effect, Option, Schema } from "effect"
import { Handle, Props, Reactive, UiState, compose, withProps } from "spar"
import type { Action } from "spar"
import { focusAt, target } from "./roving.ts"
import { TabPanelView, TabView, TabsView } from "./TabsView.tsx"

export const Tab = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Props.Element,
})

export type Tab = typeof Tab.Type

export const Tabs = compose(
  withProps({ label: Schema.String, tabs: Schema.NonEmptyArray(Tab) }),
  Effect.fnUntraced(function* (props) {
    const selected = yield* UiState.make("selected", Schema.String, props.tabs[0].id)
    const handles = yield* Effect.forEach(props.tabs, () => Handle.make)
    const ids = props.tabs.map((tab) => tab.id)
    const go = (index: number): Action => [
      Option.toArray(Array.get(ids, index)).map((id) => UiState.set(selected, id)),
      focusAt(handles, index),
    ]

    return {
      label: props.label,
      tabs: Array.zip(props.tabs, handles).map(([tab, handle], index) =>
        TabView({
          id: tab.id,
          title: tab.title,
          handle,
          selected: Reactive.map(selected, (id) => id === tab.id),
          tabIndex: Reactive.map(selected, (id) => (id === tab.id ? 0 : -1)),
          onSelect: UiState.set(selected, tab.id),
          onKey: (event) =>
            Option.match(target(event.key, index, ids.length), { onNone: () => [], onSome: go }),
        }),
      ),
      panels: props.tabs.map((tab) =>
        TabPanelView({
          id: tab.id,
          hidden: Reactive.map(selected, (id) => id !== tab.id),
          content: tab.content,
        }),
      ),
    }
  }),
)(TabsView)
