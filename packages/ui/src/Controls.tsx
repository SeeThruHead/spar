import { Schema } from "effect"
import { Form, Props, View } from "spar"

export const Tone = Schema.Literals(["primary", "quiet", "danger"])

export type Tone = typeof Tone.Type

export const Button = View.make(
  "Button",
  {
    label: Schema.String,
    tone: Tone,
    disabled: Props.Reactive(Schema.Boolean),
    onPress: Props.Action,
  },
  ({ label, tone, disabled, onPress }) => (
    <button type="button" class={`spar-button spar-${tone}`} disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
)

export const SubmitButton = View.make(
  "SubmitButton",
  { label: Schema.String, busy: Props.Reactive(Schema.Boolean) },
  ({ label, busy }) => (
    <button type="submit" class="spar-button spar-primary" disabled={busy} aria-busy={busy}>
      {label}
    </button>
  ),
)

export const TextField = View.make(
  "TextField",
  {
    id: Schema.String,
    label: Schema.String,
    hint: Schema.String,
    type: Schema.Literals(["text", "email", "password", "search", "number", "tel", "url"]),
    field: Form.Field(Schema.String),
  },
  ({ id, label, hint, type, field }) => (
    <div class="spar-field">
      <label for={id}>{label}</label>
      <input
        id={id}
        type={type}
        aria-describedby={`${id}-hint ${id}-problem`}
        {...Form.text(field)}
      />
      <p id={`${id}-hint`} class="spar-hint">
        {hint}
      </p>
      <p id={`${id}-problem`} class="spar-problem" role="alert">
        {field.error}
      </p>
    </div>
  ),
)

export const OptionView = View.make(
  "OptionView",
  { value: Schema.String, label: Schema.String },
  ({ value, label }) => <option value={value}>{label}</option>,
)

export const SelectView = View.make(
  "SelectView",
  {
    id: Schema.String,
    label: Schema.String,
    field: Form.Field(Schema.String),
    options: Schema.Array(Props.Element),
  },
  ({ id, label, field, options }) => (
    <div class="spar-field">
      <label for={id}>{label}</label>
      <select id={id} aria-describedby={`${id}-problem`} {...Form.text(field)}>
        {options}
      </select>
      <p id={`${id}-problem`} class="spar-problem" role="alert">
        {field.error}
      </p>
    </div>
  ),
)

export const Checkbox = View.make(
  "Checkbox",
  { id: Schema.String, label: Schema.String, field: Form.Field(Schema.Boolean) },
  ({ id, label, field }) => (
    <div class="spar-field">
      <label class="spar-check" for={id}>
        <input
          id={id}
          type="checkbox"
          aria-describedby={`${id}-problem`}
          {...Form.checkbox(field)}
        />
        {label}
      </label>
      <p id={`${id}-problem`} class="spar-problem" role="alert">
        {field.error}
      </p>
    </div>
  ),
)

export const Switch = View.make(
  "Switch",
  { label: Schema.String, on: Props.Reactive(Schema.Boolean), onToggle: Props.Action },
  ({ label, on, onToggle }) => (
    <button type="button" role="switch" class="spar-switch" aria-checked={on} onClick={onToggle}>
      <span class="spar-switch-thumb" />
      {label}
    </button>
  ),
)
