import { UiState } from "spar"
import type { Action, Reactive } from "spar"

const LabelView = ({ text }: { readonly text: string }) => <span>{text}</span>

type DraftProps = {
  readonly draft: UiState.UiState<string>
  readonly urgent: UiState.UiState<boolean>
  readonly saved: Reactive.Reactive<string>
  readonly onSave: Action
}

export const DraftView = ({ draft, urgent, saved, onSave }: DraftProps) => (
  <>
    <label>
      <LabelView text="Note" />
      <input value={draft} onInput={(event) => UiState.set(draft, event.currentTarget.value)} />
    </label>
    <label>
      <LabelView text="Urgent" />
      <input type="checkbox" checked={urgent} onChange={UiState.update(urgent, (on) => !on)} />
    </label>
    <button disabled={false} hidden={urgent} onClick={[onSave, UiState.set(draft, "")]}>
      Save note
    </button>
    <output aria-label="Saved">{saved}</output>
  </>
)

export const SpanView = ({ span }: { readonly span: string }) => <p role="note">{span}</p>

export const EmptyView = () => <p role="status">Nothing here</p>

export const CountView = ({ count }: { readonly count: number }) => (
  <p role="status">{count} items</p>
)
