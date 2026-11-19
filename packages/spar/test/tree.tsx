import type { Action, Element, UiState } from "spar"

type NoteProps = {
  readonly id: string
  readonly text: UiState.UiState<string>
  readonly onClear: Action
}

export const NoteView = ({ id, text, onClear }: NoteProps) => (
  <li>
    <output aria-label="Note">{text}</output>
    <button onClick={onClear}>Clear {id}</button>
  </li>
)

export const PanelView = ({ open }: { readonly open: UiState.UiState<boolean> }) => (
  <aside hidden={open}>Panel</aside>
)

type BoardProps = {
  readonly title: UiState.UiState<string>
  readonly notes: Element
  readonly always: Element
  readonly sometimes: Element
}

export const BoardView = ({ title, notes, always, sometimes }: BoardProps) => (
  <section>
    <h1>{title}</h1>
    <ul>{notes}</ul>
    {always}
    {sometimes}
  </section>
)

export const TwiceView = ({ first }: { readonly first: UiState.UiState<string> }) => <p>{first}</p>
