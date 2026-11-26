import { Effect, Option, Predicate } from "effect"
import type { Schema } from "effect"
import { WriteTypeId } from "./internal/action.ts"
import type { Action as AnyAction, Handler as AnyHandler } from "./internal/action.ts"
import { isElement } from "./internal/element.ts"
import type { Element as AnyElement } from "./internal/element.ts"
import { isHandle } from "./internal/handle.ts"
import type { Handle as AnyHandle } from "./internal/handle.ts"
import { encoded, kind, named } from "./internal/props.ts"
import type { Show } from "./internal/props.ts"
import { Backing, Direct, isReactive } from "./internal/reactive.ts"
import type { Backed, Reactive as AnyReactive } from "./internal/reactive.ts"
import { Kept } from "./internal/uiTree.ts"

export type { Field, Fields } from "./internal/props.ts"

const current =
  (inner: Schema.Codec<unknown, unknown>): Show =>
  (value) =>
    Option.flatMap(Option.liftPredicate(value, isReactive), (reactive) =>
      Option.flatMap(Option.fromUndefinedOr(reactive[Direct]), (now) => encoded(inner)(now.read())),
    )

export const Reactive = <A>(inner: Schema.Codec<A, unknown>): Schema.declare<AnyReactive<A>> =>
  kind((value): value is AnyReactive<A> => isReactive(value), current(inner))

const isState = (value: unknown): boolean => {
  if (!isReactive(value)) return false

  return Predicate.hasProperty(value, Backing) && value[Backing] instanceof Kept
}

export const State = <A>(inner: Schema.Codec<A, unknown>): Schema.declare<Backed<A, Kept<A>>> =>
  kind((value): value is Backed<A, Kept<A>> => isState(value), current(inner))

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

type On<Tag> = [Tag] extends [keyof HTMLElementTagNameMap]
  ? { readonly currentTarget: HTMLElementTagNameMap[Tag] }
  : unknown

export const Handler = <
  const Name extends keyof HTMLElementEventMap,
  const Tag extends keyof HTMLElementTagNameMap | undefined = undefined,
>(
  _event: Name,
  _on?: Tag,
): Schema.declare<AnyHandler<HTMLElementEventMap[Name] & On<Tag>>> =>
  kind(
    (value): value is AnyHandler<HTMLElementEventMap[Name] & On<Tag>> =>
      Predicate.isNotNullish(value),
    named("handler"),
  )
