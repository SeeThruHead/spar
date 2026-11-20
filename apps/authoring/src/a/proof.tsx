import { Schema, flow } from "effect"
import type { Element, Reactive, UiState } from "spar"
import { CounterStore } from "../shared/counter.store.ts"
import { compose, withKey, withStore, withUiState } from "./api.ts"

type Same<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

const proved = <const T extends true>(holds: T): T => holds

export const Inferred = compose(
  withStore(CounterStore, (store) => ({ count: store.select.count })),
  withUiState("open", Schema.Boolean, false),
  withKey("+", (props) => {
    proved<Same<typeof props.count, Reactive.Reactive<number>>>(true)
    proved<Same<typeof props.open, UiState.UiState<boolean>>>(true)

    return []
  }),
)((props) => {
  proved<Same<typeof props.count, Reactive.Reactive<number>>>(true)
  proved<Same<typeof props.open, UiState.UiState<boolean>>>(true)

  // @ts-expect-error a prop no enhancer added does not exist
  const missing = props.nothing

  return <output>{props.count}</output>
})

type Wrapping<Add> = <P>(view: (props: P & Add) => Element) => (props: P) => Element

declare const wrappingStore: Wrapping<{ readonly count: Reactive.Reactive<number> }>

declare const wrappingOpen: Wrapping<{ readonly open: UiState.UiState<boolean> }>

export const WithEffectsFlow = flow(
  wrappingStore,
  wrappingOpen,
)((props) => {
  proved<Same<typeof props.count, Reactive.Reactive<number>>>(true)

  // @ts-expect-error Effect's flow gives the view to the first function, so the view only ever
  // sees what the first enhancer adds: the second one's prop is not there
  const missing = props.open

  return <output>{props.count}</output>
})
