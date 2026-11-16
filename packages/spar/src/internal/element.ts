import { Predicate } from "effect"
import type { Effect, Scope } from "effect"
import type { Reactive } from "./reactive.ts"

export const TypeId = "~spar/Element"

export type Rows<A> = {
  readonly items: Reactive<ReadonlyArray<A>>
  readonly key: (item: A) => string
  readonly mount: (key: string, item: Reactive<A>) => Effect.Effect<Element, never, Scope.Scope>
}

export type Intrinsic = {
  readonly [TypeId]: "Intrinsic"
  readonly tag: string
  readonly props: Readonly<Record<string, unknown>>
}

export type Keyed = {
  readonly [TypeId]: "Keyed"
  readonly open: <X>(use: <A>(rows: Rows<A>) => X) => X
}

export type Element =
  | Intrinsic
  | Keyed
  | { readonly [TypeId]: "Fragment"; readonly children: ReadonlyArray<unknown> }
  | { readonly [TypeId]: "Portal"; readonly layer: HTMLElement; readonly child: Element }

export const intrinsic = (tag: string, props: Readonly<Record<string, unknown>>): Element => ({
  [TypeId]: "Intrinsic",
  tag,
  props,
})

export const fragment = (children: ReadonlyArray<unknown>): Element => ({
  [TypeId]: "Fragment",
  children,
})

export const keyed = <A>(rows: Rows<A>): Element => ({
  [TypeId]: "Keyed",
  open: (use) => use(rows),
})

export const portal = (layer: HTMLElement, child: Element): Element => ({
  [TypeId]: "Portal",
  layer,
  child,
})

export const isElement = (value: unknown): value is Element => Predicate.hasProperty(value, TypeId)
