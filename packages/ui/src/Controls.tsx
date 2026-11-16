import { Form } from "spar"
import type { Action, Element, Reactive } from "spar"

export type Tone = "primary" | "quiet" | "danger"

type ButtonProps = {
  readonly label: string
  readonly tone: Tone
  readonly disabled: Reactive.Reactive<boolean>
  readonly onPress: Action
}

export const Button = ({ label, tone, disabled, onPress }: ButtonProps) => (
  <button type="button" class={`spar-button spar-${tone}`} disabled={disabled} onClick={onPress}>
    {label}
  </button>
)

type SubmitProps = {
  readonly label: string
  readonly busy: Reactive.Reactive<boolean>
}

export const SubmitButton = ({ label, busy }: SubmitProps) => (
  <button type="submit" class="spar-button spar-primary" disabled={busy} aria-busy={busy}>
    {label}
  </button>
)

type TextFieldProps = {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly type: "text" | "email" | "password" | "search" | "number" | "tel" | "url"
  readonly field: Form.Field<string>
}

export const TextField = ({ id, label, hint, type, field }: TextFieldProps) => (
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
    <p id={`${id}-problem`} class="spar-problem" aria-live="polite">
      {field.error}
    </p>
  </div>
)

type SelectViewProps = {
  readonly id: string
  readonly label: string
  readonly field: Form.Field<string>
  readonly options: ReadonlyArray<Element>
}

export const OptionView = ({
  value,
  label,
}: {
  readonly value: string
  readonly label: string
}) => <option value={value}>{label}</option>

export const SelectView = ({ id, label, field, options }: SelectViewProps) => (
  <div class="spar-field">
    <label for={id}>{label}</label>
    <select id={id} aria-describedby={`${id}-problem`} {...Form.text(field)}>
      {options}
    </select>
    <p id={`${id}-problem`} class="spar-problem" aria-live="polite">
      {field.error}
    </p>
  </div>
)

type CheckboxProps = {
  readonly id: string
  readonly label: string
  readonly field: Form.Field<boolean>
}

export const Checkbox = ({ id, label, field }: CheckboxProps) => (
  <div class="spar-field">
    <label class="spar-check" for={id}>
      <input id={id} type="checkbox" aria-describedby={`${id}-problem`} {...Form.checkbox(field)} />
      {label}
    </label>
    <p id={`${id}-problem`} class="spar-problem" aria-live="polite">
      {field.error}
    </p>
  </div>
)

type SwitchProps = {
  readonly label: string
  readonly on: Reactive.Reactive<boolean>
  readonly onToggle: Action
}

export const Switch = ({ label, on, onToggle }: SwitchProps) => (
  <button type="button" role="switch" class="spar-switch" aria-checked={on} onClick={onToggle}>
    <span class="spar-switch-thumb" />
    {label}
  </button>
)
