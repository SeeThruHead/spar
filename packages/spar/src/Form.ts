import {
  Effect,
  Option,
  Predicate,
  Record,
  Result,
  Schema,
  SchemaIssue,
  SubscriptionRef,
} from "effect"
import { ActionScope } from "./internal/actionScope.ts"
import { run, write } from "./internal/action.ts"
import type { Action, UiWrite } from "./internal/action.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"
import * as Props from "./Props.ts"

type Inputs = Readonly<Record<string, string | boolean>>

type Messages = Readonly<Record<string, string>>

export class Rejected extends Schema.TaggedError<Rejected, { readonly brand: unique symbol }>()(
  "Rejected",
  { message: Schema.String, fields: Schema.Record(Schema.String, Schema.String) },
) {}

export type Field<Value> = {
  readonly name: string
  readonly value: Reactive<Value>
  readonly error: Reactive<string>
  readonly invalid: Reactive<boolean>
  readonly change: (value: Value) => UiWrite
  readonly touch: UiWrite
}

const isField = <Value>(value: unknown): value is Field<Value> => {
  if (!Predicate.hasProperty(value, "change")) return false

  return Predicate.hasProperty(value, "touch") && Predicate.hasProperty(value, "value")
}

export const Field = <Value>(inner: Schema.Codec<Value, unknown>): Schema.declare<Field<Value>> => {
  const reading = Props.Reactive(inner)

  return Props.kind(
    (value): value is Field<Value> => isField(value),
    (value) =>
      Option.flatMap(Option.liftPredicate(value, isField), (field) =>
        Props.shown(reading, field.value),
      ),
  )
}

export type Form<Valid, Input extends Inputs> = {
  readonly field: <Name extends keyof Input & string>(name: Name) => Field<Input[Name]>
  readonly error: Reactive<string>
  readonly submitting: Reactive<boolean>
  readonly submit: <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
  ) => Effect.Effect<void, never, R>
  readonly submitThen: <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ) => Effect.Effect<void, never, R>
  readonly reset: UiWrite
}

type State<Input> = {
  readonly values: Input
  readonly touched: ReadonlySet<string>
  readonly attempted: boolean
  readonly rejected: Messages
  readonly failure: string
  readonly submitting: boolean
}

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

const wholeForm = ""

const nameOf = (path: ReadonlyArray<unknown> | undefined): string =>
  Option.toArray(Option.fromNullishOr(path))
    .flat()
    .filter(Predicate.isPropertyKey)
    .slice(0, 1)
    .map(String)
    .join("")

const messagesOf = (error: Schema.SchemaError): Messages =>
  Object.fromEntries(
    formatIssues(error.issue)
      .issues.toReversed()
      .map((issue) => [nameOf(issue.path), issue.message] as const),
  )

const shown = <Input>(state: State<Input>, problems: Messages, name: string): string => {
  const rejected = state.rejected[name]
  if (rejected !== undefined) return rejected
  if (!state.attempted && !state.touched.has(name)) return ""

  return problems[name] ?? ""
}

const formProblem = <Input>(state: State<Input>, problems: Messages): string => {
  if (state.failure.length > 0) return state.failure

  return shown(state, problems, wholeForm)
}

export const make = Effect.fnUntraced(function* <Valid, Input extends Inputs>(
  schema: Schema.Codec<Valid, Input>,
  initial: Input,
) {
  yield* ViewScope

  const fresh: State<Input> = {
    values: initial,
    touched: new Set(),
    attempted: false,
    rejected: {},
    failure: "",
    submitting: false,
  }
  const state = yield* SubscriptionRef.make(fresh)
  const current = fromSubscriptionRef(state)
  const check = Schema.decodeUnknownResult(schema, { errors: "all" })
  const problems = (values: Input): Messages =>
    Result.match(check(values), { onSuccess: () => ({}), onFailure: messagesOf })

  const field = <Name extends keyof Input & string>(name: Name): Field<Input[Name]> => {
    const error = map(current, (now) => shown(now, problems(now.values), name))

    return {
      name,
      value: map(current, (now) => now.values[name]),
      error,
      invalid: map(error, (message) => message.length > 0),
      change: (value) =>
        write(
          SubscriptionRef.update(state, (now) => ({
            ...now,
            values: { ...now.values, [name]: value },
            rejected: Record.remove(now.rejected, name),
          })),
        ),
      touch: write(
        SubscriptionRef.update(state, (now) => ({
          ...now,
          touched: new Set([...now.touched, name]),
        })),
      ),
    }
  }

  const send = <R>(
    value: Valid,
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ): Effect.Effect<void, never, R> =>
    onValid(value).pipe(
      Effect.andThen(run(onDone)),
      Effect.catch((rejected) =>
        SubscriptionRef.update(state, (now) => ({
          ...now,
          rejected: rejected.fields,
          failure: rejected.message,
        })),
      ),
      Effect.ensuring(SubscriptionRef.update(state, (now) => ({ ...now, submitting: false }))),
    )

  const start = Effect.fnUntraced(function* <R>(
    value: Valid,
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ) {
    const outliving = yield* ActionScope

    yield* SubscriptionRef.update(state, (now) => ({ ...now, submitting: true, failure: "" }))
    yield* Effect.forkIn(send(value, onValid, onDone), outliving, { startImmediately: true })
  })

  const submitThen = <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ): Effect.Effect<void, never, R> =>
    Effect.flatMap(SubscriptionRef.get(state), (now) => {
      if (now.submitting) return Effect.void

      return Result.match(check(now.values), {
        onFailure: () => SubscriptionRef.set(state, { ...now, attempted: true }),
        onSuccess: (value) => start(value, onValid, onDone),
      })
    })

  const submit = <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
  ): Effect.Effect<void, never, R> => submitThen(onValid, [])

  const form: Form<Valid, Input> = {
    field,
    error: map(current, (now) => formProblem(now, problems(now.values))),
    submitting: map(current, (now) => now.submitting),
    submit,
    submitThen,
    reset: write(SubscriptionRef.set(state, fresh)),
  }

  return form
})

export const text = (field: Field<string>) => ({
  name: field.name,
  value: field.value,
  "aria-invalid": field.invalid,
  onInput: (event: { readonly currentTarget: { readonly value: string } }) =>
    field.change(event.currentTarget.value),
  onBlur: field.touch,
})

export const checkbox = (field: Field<boolean>) => ({
  name: field.name,
  checked: field.value,
  "aria-invalid": field.invalid,
  onChange: (event: { readonly currentTarget: { readonly checked: boolean } }) =>
    field.change(event.currentTarget.checked),
  onBlur: field.touch,
})
