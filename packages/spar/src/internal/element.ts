import { Predicate } from "effect"
import type { Effect, Scope } from "effect"
import type { Reactive } from "./reactive.ts"

export const TypeId = "~spar/Element"

export type Row = {
  readonly key: string
  readonly mount: Effect.Effect<Element, never, Scope.Scope>
  readonly refresh: Effect.Effect<void>
}

export type Intrinsic = {
  readonly [TypeId]: "Intrinsic"
  readonly tag: string
  readonly props: Readonly<Record<string, unknown>>
}

export type Element =
  | Intrinsic
  | { readonly [TypeId]: "Fragment"; readonly children: ReadonlyArray<unknown> }
  | { readonly [TypeId]: "Keyed"; readonly rows: Reactive<ReadonlyArray<Row>> }

export const intrinsic = (tag: string, props: Readonly<Record<string, unknown>>): Element => ({
  [TypeId]: "Intrinsic",
  tag,
  props,
})

export const fragment = (children: ReadonlyArray<unknown>): Element => ({
  [TypeId]: "Fragment",
  children,
})

export const keyed = (rows: Reactive<ReadonlyArray<Row>>): Element => ({
  [TypeId]: "Keyed",
  rows,
})

export const isElement = (value: unknown): value is Element => Predicate.hasProperty(value, TypeId)
