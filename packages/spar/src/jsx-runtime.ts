import { Predicate } from "effect"
import type { Handler } from "./internal/action.ts"
import { fragment, intrinsic } from "./internal/element.ts"
import type { Element as SparElement } from "./internal/element.ts"
import type { Reactive } from "./internal/reactive.ts"
import type { View } from "./View.ts"

type Child = string | number | Reactive<string | number> | SparElement

export type Children = Child | ReadonlyArray<Child>

type Attribute<A> = A | Reactive<A>

type Events<Target> = {
  readonly [Name in keyof HTMLElementEventMap as `on${Capitalize<Name>}`]?: Handler<
    HTMLElementEventMap[Name] & { readonly currentTarget: Target }
  >
}

type Attributes = {
  readonly children?: Children
  readonly class?: Attribute<string>
  readonly id?: Attribute<string>
  readonly type?: Attribute<string>
  readonly name?: Attribute<string>
  readonly value?: Attribute<string | number>
  readonly placeholder?: Attribute<string>
  readonly title?: Attribute<string>
  readonly href?: Attribute<string>
  readonly role?: Attribute<string>
  readonly for?: Attribute<string>
  readonly checked?: Attribute<boolean>
  readonly disabled?: Attribute<boolean>
  readonly hidden?: Attribute<boolean>
}

export declare namespace JSX {
  type Element = SparElement
  type ElementType = keyof IntrinsicElements | View<never>
  type ElementChildrenAttribute = { readonly children: unknown }
  type IntrinsicElements = {
    readonly [Tag in keyof HTMLElementTagNameMap]: Attributes & Events<HTMLElementTagNameMap[Tag]>
  }
}

export const jsx = <Props extends Readonly<Record<string, unknown>>>(
  tag: string | View<Props>,
  props: Props,
): SparElement => (Predicate.isString(tag) ? intrinsic(tag, props) : tag(props))

export const jsxs = jsx

export const jsxDEV = jsx

export const Fragment = (props: { readonly children?: Children }): SparElement =>
  fragment([props.children])
