import { Schema } from "effect"
import { Props, View } from "spar"

export const DraftView = View.make(
  "DraftView",
  {
    text: Props.State(Schema.String),
    onType: Props.Handler("input"),
    onLoad: Props.Action,
    onClear: Props.Action,
  },
  ({ text, onType, onLoad, onClear }) => (
    <p>
      <input aria-label="Draft" value={text} onInput={onType} />
      <button type="button" onClick={onLoad}>
        Load
      </button>
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </p>
  ),
)
