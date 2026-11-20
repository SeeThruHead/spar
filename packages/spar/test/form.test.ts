import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Deferred, Effect, Layer, Option, Ref, Schema, SubscriptionRef } from "effect"
import { Form, Reactive, Timeline, UiState, View } from "spar"
import * as Testing from "spar/testing"
import { SignupView } from "./signup.tsx"

const Signup = Schema.Struct({
  email: Schema.String.check(
    Schema.makeFilter((text) => /^\S+@\S+$/.test(text) || "Enter an email address"),
  ),
  age: Schema.FiniteFromString.check(
    Schema.makeFilter((age) => age >= 18 || "You must be 18 or older"),
  ),
  terms: Schema.Boolean.check(
    Schema.makeFilter((accepted) => accepted || "Accept the terms to continue"),
  ),
}).check(
  Schema.makeFilter(
    (account) => account.email !== "root@example.com" || "That address cannot sign up here",
  ),
)

type Account = typeof Signup.Type

const SignupForm = (
  accounts: Ref.Ref<ReadonlyArray<Account>>,
  server: Deferred.Deferred<void, Form.Rejected>,
  clearing: boolean,
) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const form = yield* Form.make(Signup, { email: "", age: "", terms: false })
      const welcome = yield* SubscriptionRef.make("")
      const save = Effect.fnUntraced(function* (account: Account) {
        yield* Ref.update(accounts, (all) => [...all, account])
        yield* Deferred.await(server)
        yield* SubscriptionRef.set(welcome, `Welcome, ${account.email}`)
      })

      return {
        email: form.field("email"),
        age: form.field("age"),
        terms: form.field("terms"),
        problem: form.error,
        submitting: form.submitting,
        welcome: Reactive.fromSubscriptionRef(welcome),
        onReset: form.reset,
        onSubmit: clearing ? form.submitThen(save, form.reset) : form.submit(save),
      }
    }),
  )(SignupView)

const startedWith = Effect.fnUntraced(function* (clearing: boolean) {
  const accounts = yield* Ref.make<ReadonlyArray<Account>>([])
  const server = yield* Deferred.make<void, Form.Rejected>()

  yield* Testing.mount(SignupForm(accounts, server, clearing))

  return { accounts: Ref.get(accounts), server }
})

const started = startedWith(false)

const text = (label: string) => screen.getByLabelText(label).textContent

const shows = (label: string, expected: string) =>
  Testing.eventually(() => expect(text(label)).toBe(expected))

const leave = (name: string) =>
  Effect.flatMap(Testing.find("textbox", name), (input) => Effect.sync(() => fireEvent.blur(input)))

const fillValid = Effect.gen(function* () {
  yield* Testing.fill("textbox", "Email", "ada@example.com")
  yield* Testing.fill("textbox", "Age", "36")
  yield* Testing.click("checkbox", "I accept the terms")
})

const TwoForms = View.connect(
  Effect.fnUntraced(function* () {
    const first = yield* Form.make(Signup, { email: "", age: "", terms: false })
    const second = yield* Form.make(Signup, { email: "", age: "", terms: false })

    return {
      email: first.field("email"),
      age: second.field("email"),
      terms: first.field("terms"),
      problem: first.error,
      submitting: first.submitting,
      welcome: Reactive.succeed(""),
      onReset: first.reset,
      onSubmit: first.submit(() => Effect.void),
    }
  }),
)(SignupView)

describe("a form's state is the component's UI state", () => {
  it.live("typing, leaving a field and a refused submit are in the log, and can be put back", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const names = Effect.map(Ref.get(noted), (all) =>
        all.map((seen) => `${seen.kind} ${seen.name}`),
      )

      yield* started.pipe(
        Effect.provideService(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      )
      yield* Testing.fill("textbox", "Email", "ada")
      yield* leave("Email")
      yield* shows("Email problem", "Enter an email address")
      yield* leave("Email")

      const before = yield* UiState.snapshot

      expect(JSON.stringify(before)).toContain('"email":"ada"')
      expect(yield* names).toEqual([
        "ui SignupView . form (email, age, terms)",
        "ui SignupView . form (email, age, terms)",
      ])

      yield* Testing.fill("textbox", "Email", "ada@example.com")
      yield* shows("Email problem", "")
      yield* Testing.click("button", "Create account")
      yield* shows("Age problem", "You must be 18 or older")
      expect((yield* names).length).toBe(4)

      yield* UiState.restore(before)
      yield* shows("Email problem", "Enter an email address")
      yield* shows("Age problem", "")
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Email" }).value).toBe("ada")
    }).pipe(Effect.provide(Layer.sync(UiState.Tree, UiState.makeTree))),
  )

  it.live("two forms in one component keep their state apart", () =>
    Effect.gen(function* () {
      yield* Testing.mount(TwoForms)
      yield* Testing.fill("textbox", "Email", "first@example.com")
      yield* Testing.fill("textbox", "Age", "second")

      expect(JSON.stringify(yield* UiState.snapshot)).toMatch(
        /"name":"form \(email, age, terms\)".*"email":"first@example\.com".*"name":"form 2 \(email, age, terms\)".*"email":"second"/,
      )
    }).pipe(Effect.provide(Layer.sync(UiState.Tree, UiState.makeTree))),
  )
})

describe("forms", () => {
  it.live("a problem shows once its field has been left, and goes when it is fixed", () =>
    Effect.gen(function* () {
      yield* started
      yield* Testing.fill("textbox", "Email", "ada")
      yield* Effect.sleep("10 millis")

      expect(text("Email problem")).toBe("")

      yield* leave("Email")
      yield* shows("Email problem", "Enter an email address")

      const email = yield* Testing.find("textbox", "Email")

      expect(email.getAttribute("aria-invalid")).toBe("true")

      yield* Testing.fill("textbox", "Email", "ada@example.com")
      yield* shows("Email problem", "")
      yield* Testing.eventually(() => expect(email.getAttribute("aria-invalid")).toBe("false"))
    }),
  )

  it.live("submitting input that is not valid shows every problem and sends nothing", () =>
    Effect.gen(function* () {
      const { accounts } = yield* started

      yield* Testing.fill("textbox", "Age", "12")
      yield* Testing.click("button", "Create account")
      yield* shows("Email problem", "Enter an email address")
      yield* shows("Age problem", "You must be 18 or older")
      yield* shows("Terms problem", "Accept the terms to continue")

      expect(yield* accounts).toEqual([])
    }),
  )

  it.live("valid input is sent once, decoded, and the button waits while it is on its way", () =>
    Effect.gen(function* () {
      const { accounts, server } = yield* started

      yield* fillValid
      yield* Testing.click("button", "Create account")

      const button = yield* Testing.find("button", "Create account")

      yield* Testing.eventually(() => expect(button).toHaveProperty("disabled", true))
      yield* Effect.sync(() => fireEvent.submit(screen.getByRole("form", { name: "Sign up" })))
      yield* Effect.sleep("20 millis")
      yield* Deferred.succeed(server, undefined)
      yield* shows("Welcome", "Welcome, ada@example.com")
      yield* Testing.eventually(() => expect(button).toHaveProperty("disabled", false))

      expect(yield* accounts).toEqual([{ email: "ada@example.com", age: 36, terms: true }])
    }),
  )

  it.live("what the server refuses lands on its field and clears when that field changes", () =>
    Effect.gen(function* () {
      const { server } = yield* started

      yield* fillValid
      yield* Deferred.fail(
        server,
        new Form.Rejected({
          message: "The account was not created",
          fields: { email: "That address already has an account" },
        }),
      )
      yield* Testing.click("button", "Create account")
      yield* shows("Email problem", "That address already has an account")
      yield* shows("Form problem", "The account was not created")
      yield* Testing.fill("textbox", "Email", "grace@example.com")
      yield* shows("Email problem", "")
    }),
  )

  it.live("a problem with the form as a whole shows once a submit has been tried", () =>
    Effect.gen(function* () {
      const { accounts } = yield* started

      yield* fillValid
      yield* Testing.fill("textbox", "Email", "root@example.com")
      yield* Effect.sleep("10 millis")

      expect(text("Form problem")).toBe("")

      yield* Testing.click("button", "Create account")
      yield* shows("Form problem", "That address cannot sign up here")

      expect(yield* accounts).toEqual([])
    }),
  )

  it.live("an action given for after a submit runs only once the submit has worked", () =>
    Effect.gen(function* () {
      const { server } = yield* startedWith(true)

      yield* Testing.click("button", "Create account")
      yield* shows("Email problem", "Enter an email address")
      yield* fillValid
      yield* Testing.click("button", "Create account")
      yield* Effect.sleep("20 millis")

      expect(yield* Testing.find("textbox", "Email")).toHaveProperty("value", "ada@example.com")

      yield* Deferred.succeed(server, undefined)
      yield* shows("Welcome", "Welcome, ada@example.com")
      yield* Testing.eventually(() =>
        expect(screen.getByRole("textbox", { name: "Email" })).toHaveProperty("value", ""),
      )
    }),
  )

  it.live("starting over empties the form and its problems", () =>
    Effect.gen(function* () {
      yield* started
      yield* Testing.fill("textbox", "Email", "ada")
      yield* Testing.click("button", "Create account")
      yield* shows("Email problem", "Enter an email address")
      yield* Testing.click("button", "Start over")
      yield* shows("Email problem", "")

      expect(yield* Testing.find("textbox", "Email")).toHaveProperty("value", "")
    }),
  )

  it.live("a submit in the same breath as the last keystroke sends what was typed", () =>
    Effect.gen(function* () {
      const { accounts } = yield* started
      const email = screen.getByRole<HTMLInputElement>("textbox", { name: "Email" })

      yield* fillValid
      yield* Effect.sync(() => {
        fireEvent.input(email, { target: { value: "grace@example.com" } })
        fireEvent.submit(screen.getByRole("form", { name: "Sign up" }))
      })
      yield* Effect.sleep("30 millis")
      expect((yield* accounts).map((account) => account.email)).toEqual(["grace@example.com"])
    }),
  )
})
