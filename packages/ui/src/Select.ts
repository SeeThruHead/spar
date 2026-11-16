import type { Element, Form } from "spar"
import { OptionView, SelectView } from "./Controls.tsx"

export const Select = (props: {
  readonly id: string
  readonly label: string
  readonly field: Form.Field<string>
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
}): Element => SelectView({ ...props, options: props.options.map(OptionView) })
