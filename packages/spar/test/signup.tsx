import { Schema } from "effect"
import { Events, Form, Props, View } from "spar"

export const SignupView = View.make(
  "SignupView",
  {
    email: Form.Field(Schema.String),
    age: Form.Field(Schema.String),
    terms: Form.Field(Schema.Boolean),
    problem: Props.Reactive(Schema.String),
    submitting: Props.Reactive(Schema.Boolean),
    welcome: Props.Reactive(Schema.String),
    onSubmit: Props.Action,
    onReset: Props.Action,
  },
  (props) => (
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
  ),
)
