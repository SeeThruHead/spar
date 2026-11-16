import { UiState } from "spar"
import type { Action, Element, Handle, Reactive } from "spar"

type PickerProps = {
  readonly open: UiState.UiState<boolean>
  readonly trigger: Handle.Handle
  readonly onOpen: Action
  readonly options: Element
  readonly note: Reactive.Reactive<string>
  readonly onMeasure: Action
  readonly onFocusMissing: Action
}

export const PickerView = (props: PickerProps) => (
  <section aria-label="Picker">
    <button ref={props.trigger} aria-expanded={props.open} onClick={props.onOpen}>
      Pick a colour
    </button>
    {props.options}
    <button onClick={props.onMeasure}>Measure</button>
    <button onClick={props.onFocusMissing}>Focus something missing</button>
    <output aria-label="Note">{props.note}</output>
  </section>
)

type OptionsProps = {
  readonly first: Handle.Handle
  readonly onClose: Action
}

export const OptionsView = ({ first, onClose }: OptionsProps) => (
  <ul role="listbox" aria-label="Colours">
    <li>
      <button ref={first} role="option" onClick={onClose}>
        Red
      </button>
    </li>
  </ul>
)
