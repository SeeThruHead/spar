import { Reactive, UiState } from "spar"
import type { Action, Element } from "spar"

export type Item = {
  readonly id: string
  readonly label: string
}

export const ItemView = ({ item }: { readonly item: Reactive.Reactive<Item> }) => (
  <li>{Reactive.map(item, (current) => current.label)}</li>
)

type BoardProps = {
  readonly total: Reactive.Reactive<number>
  readonly rows: Element
  readonly onAdd: Action
}

export const BoardView = ({ total, rows, onAdd }: BoardProps) => (
  <section aria-label="Board">
    <output aria-label="Total">{total}</output>
    <button onClick={onAdd}>Add item</button>
    <ul aria-label="Items">{rows}</ul>
  </section>
)

export const DetailsView = ({ note }: { readonly note: string }) => <p role="note">{note}</p>

type DisclosureProps = {
  readonly open: UiState.UiState<boolean>
  readonly details: Element
}

export const DisclosureView = ({ open, details }: DisclosureProps) => (
  <section aria-label="Disclosure">
    <button onClick={UiState.update(open, (shown) => !shown)}>Toggle details</button>
    {details}
  </section>
)

export const LoadingView = ({ id }: { readonly id: string }) => <p role="status">Loading {id}</p>

export const LoadedView = ({ title }: { readonly title: string }) => <h2>{title}</h2>

type Failure = {
  readonly _tag: "LoadFailed"
  readonly message: string
}

export const FailedView = ({ error }: { readonly error: Failure }) => (
  <p role="alert">{error.message}</p>
)
