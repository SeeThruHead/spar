import { Schema } from "effect"
import { Props, UiState, View } from "spar"

const LabelView = View.make("LabelView", { text: Schema.String }, ({ text }) => <span>{text}</span>)

export const DraftView = View.make(
  "DraftView",
  {
    draft: Props.State(Schema.String),
    urgent: Props.State(Schema.Boolean),
    saved: Props.Reactive(Schema.String),
    onSave: Props.Action,
  },
  ({ draft, urgent, saved, onSave }) => (
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
  ),
)

export const SpanView = View.make("SpanView", { span: Schema.String }, ({ span }) => (
  <p role="note">{span}</p>
))

export const EmptyView = View.make("EmptyView", {}, () => <p role="status">Nothing here</p>)

export const CountView = View.make("CountView", { count: Schema.Finite }, ({ count }) => (
  <p role="status">{count} items</p>
))
