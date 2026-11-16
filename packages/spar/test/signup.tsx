import { Events, Form } from "spar"
import type { Action, Reactive } from "spar"

type SignupProps = {
  readonly email: Form.Field<string>
  readonly age: Form.Field<string>
  readonly terms: Form.Field<boolean>
  readonly problem: Reactive.Reactive<string>
  readonly submitting: Reactive.Reactive<boolean>
  readonly welcome: Reactive.Reactive<string>
  readonly onSubmit: Action
  readonly onReset: Action
}

export const SignupView = (props: SignupProps) => (
  <form aria-label="Sign up" onSubmit={Events.prevent(props.onSubmit)}>
    <label>
      Email
      <input {...Form.text(props.email)} />
    </label>
    <p aria-label="Email problem">{props.email.error}</p>
    <label>
      Age
      <input {...Form.text(props.age)} />
    </label>
    <p aria-label="Age problem">{props.age.error}</p>
    <label>
      <input type="checkbox" {...Form.checkbox(props.terms)} />I accept the terms
    </label>
    <p aria-label="Terms problem">{props.terms.error}</p>
    <button type="submit" disabled={props.submitting}>
      Create account
    </button>
    <button type="button" onClick={props.onReset}>
      Start over
    </button>
    <p aria-label="Form problem">{props.problem}</p>
    <output aria-label="Welcome">{props.welcome}</output>
  </form>
)
