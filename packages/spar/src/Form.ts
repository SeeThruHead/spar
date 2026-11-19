import { Effect, Option, Predicate, Record, Result, Schema, SchemaIssue } from "effect"
import { ActionScope } from "./internal/actionScope.ts"
import { run } from "./internal/action.ts"
import type { Action, UiWrite } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"
import * as Props from "./Props.ts"
import * as UiState from "./UiState.ts"

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
  readonly touched: ReadonlyArray<string>
  readonly attempted: boolean
  readonly rejected: Messages
  readonly failure: string
}

const Raw = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean]))

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
  if (!state.attempted && !state.touched.includes(name)) return ""

  return problems[name] ?? ""
}

const formProblem = <Input>(state: State<Input>, problems: Messages): string => {
  if (state.failure.length > 0) return state.failure

  return shown(state, problems, wholeForm)
}

const made = new WeakMap<object, number>()

const nameIn = (mounted: object, fields: ReadonlyArray<string>): string => {
  const earlier = made.get(mounted) ?? 0

  made.set(mounted, earlier + 1)

  return earlier === 0
    ? `form (${fields.join(", ")})`
    : `form ${earlier + 1} (${fields.join(", ")})`
}

export const make = Effect.fnUntraced(function* <Valid, Input extends Inputs>(
  schema: Schema.Codec<Valid, Input>,
  initial: Input,
) {
  const mounted = yield* ViewScope
  const fresh: State<Input> = {
    values: initial,
    touched: [],
    attempted: false,
    rejected: {},
    failure: "",
  }
  const sameShape = (values: Inputs): values is Input =>
    Object.keys(initial).every((key) => typeof values[key] === typeof initial[key])
  const state = yield* UiState.make(
    nameIn(mounted, Object.keys(initial)),
    Schema.Struct({
      values: Raw.pipe(Schema.refine(sameShape)),
      touched: Schema.Array(Schema.String),
      attempted: Schema.Boolean,
      rejected: Schema.Record(Schema.String, Schema.String),
      failure: Schema.String,
    }),
    fresh,
  )
  const current: Reactive<State<Input>> = state
  const sending = Cell.make(false)
  const changed = (change: (now: State<Input>) => State<Input>): Effect.Effect<void> =>
    run(UiState.update(state, change))
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
        UiState.update(state, (now) => ({
          ...now,
          values: { ...now.values, [name]: value },
          rejected: Record.remove(now.rejected, name),
        })),
      touch: UiState.update(state, (now) =>
        now.touched.includes(name) ? now : { ...now, touched: [...now.touched, name] },
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
        changed((now) => ({ ...now, rejected: rejected.fields, failure: rejected.message })),
      ),
      Effect.ensuring(Effect.sync(() => sending.write(false))),
    )

  const start = Effect.fnUntraced(function* <R>(
    value: Valid,
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ) {
    const outliving = yield* ActionScope

    sending.write(true)
    yield* changed((now) => ({ ...now, failure: "" }))
    yield* Effect.forkIn(send(value, onValid, onDone), outliving, { startImmediately: true })
  })

  const submitThen = <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
    onDone: Action,
  ): Effect.Effect<void, never, R> =>
    Effect.flatMap(current.get, (now) => {
      if (sending.read()) return Effect.void

      return Result.match(check(now.values), {
        onFailure: () => changed((before) => ({ ...before, attempted: true })),
        onSuccess: (value) => start(value, onValid, onDone),
      })
    })

  const submit = <R>(
    onValid: (value: Valid) => Effect.Effect<void, Rejected, R>,
  ): Effect.Effect<void, never, R> => submitThen(onValid, [])

  const form: Form<Valid, Input> = {
    field,
    error: map(current, (now) => formProblem(now, problems(now.values))),
    submitting: fromCell(sending),
    submit,
    submitThen,
    reset: UiState.set(state, fresh),
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
