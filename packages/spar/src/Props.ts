import { Effect, Option, Predicate, Schema } from "effect"
import { WriteTypeId } from "./internal/action.ts"
import type { Action as AnyAction, Handler as AnyHandler } from "./internal/action.ts"
import { isElement } from "./internal/element.ts"
import type { Element as AnyElement } from "./internal/element.ts"
import { isHandle } from "./internal/handle.ts"
import type { Handle as AnyHandle } from "./internal/handle.ts"
import { Backing, Direct, isReactive } from "./internal/reactive.ts"
import type { Backed, Reactive as AnyReactive } from "./internal/reactive.ts"

export type Field = Schema.Codec<unknown, unknown>

export type Fields = Readonly<Record<string, Field>>

type Show = (value: unknown) => Option.Option<Schema.Json>

const shows = new WeakMap<object, Show>()

export const kind = <T>(is: (value: unknown) => value is T, show: Show): Schema.declare<T> => {
  const schema = Schema.declare(is)

  shows.set(schema, (value) => (is(value) ? show(value) : Option.none()))

  return schema
}

export const named =
  (name: string): Show =>
  () =>
    Option.some(name)

const encoded =
  (schema: Field): Show =>
  (value) =>
    Schema.encodeUnknownOption(Schema.toCodecJson(schema))(value)

const current =
  (inner: Field): Show =>
  (value) =>
    Option.flatMap(Option.liftPredicate(value, isReactive), (reactive) =>
      Option.flatMap(Option.fromUndefinedOr(reactive[Direct]), (now) => encoded(inner)(now.read())),
    )

export const Reactive = <A>(inner: Schema.Codec<A, unknown>): Schema.declare<AnyReactive<A>> =>
  kind((value): value is AnyReactive<A> => isReactive(value), current(inner))

export const State = <A>(inner: Schema.Codec<A, unknown>): Schema.declare<Backed<A>> =>
  kind(
    (value): value is Backed<A> => isReactive(value) && Predicate.hasProperty(value, Backing),
    current(inner),
  )

const isAction = (value: unknown): value is AnyAction => {
  if (Effect.isEffect(value)) return true
  if (Array.isArray(value)) return true

  return Predicate.hasProperty(value, WriteTypeId)
}

export const Action: Schema.declare<AnyAction> = kind(isAction, named("action"))

export const Element: Schema.declare<AnyElement> = kind(isElement, named("element"))

export const Handle: Schema.declare<AnyHandle> = kind(isHandle, named("handle"))

export const Callback = <A>(
  _argument: Schema.Codec<A, unknown>,
): Schema.declare<(argument: A) => AnyAction> =>
  kind(
    (value): value is (argument: A) => AnyAction => Predicate.isFunction(value),
    named("callback"),
  )

export const Handler = <const Name extends keyof HTMLElementEventMap>(
  _event: Name,
): Schema.declare<AnyHandler<HTMLElementEventMap[Name]>> =>
  kind(
    (value): value is AnyHandler<HTMLElementEventMap[Name]> => Predicate.isNotNullish(value),
    named("handler"),
  )

export const shown = (field: Field, value: unknown): Option.Option<Schema.Json> =>
  (shows.get(field) ?? encoded(field))(value)

export const allShown = (fields: Fields, props: unknown): Readonly<Record<string, Schema.Json>> =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([name, field]) =>
      Option.toArray(
        Option.map(
          shown(field, Predicate.hasProperty(props, name) ? props[name] : undefined),
          (value) => [name, value] as const,
        ),
      ),
    ),
  )
