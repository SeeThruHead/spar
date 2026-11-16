import { Predicate } from "effect"
import type { Handler } from "./internal/action.ts"
import { fragment, intrinsic } from "./internal/element.ts"
import type { Element as SparElement } from "./internal/element.ts"
import type { Reactive } from "./internal/reactive.ts"
import type { View } from "./View.ts"

type Child = string | number | Reactive<string | number> | SparElement

export type Children = Child | ReadonlyArray<Child>

type Attribute<A> = A | Reactive<A>

type Same<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

type Writable<T> = {
  [K in keyof T]-?: Same<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }> extends true ? K : never
}[keyof T]

type Scalar = string | number | boolean | null

type NotProperties =
  | "innerHTML"
  | "outerHTML"
  | "innerText"
  | "outerText"
  | "textContent"
  | "nodeValue"
  | "className"
  | "htmlFor"
  | "style"
  | `on${string}`

type PropertyNames<T> = {
  [K in Writable<T> & string]: K extends NotProperties ? never : T[K] extends Scalar ? K : never
}[Writable<T> & string]

type Properties<T> = { readonly [K in PropertyNames<T>]?: Attribute<T[K]> }

type Events<Target, EventMap> = {
  readonly [Name in keyof EventMap & string as `on${Capitalize<Name>}`]?: Handler<
    EventMap[Name] & { readonly currentTarget: Target }
  >
}

type StyleNames = {
  [K in keyof CSSStyleDeclaration & string]: CSSStyleDeclaration[K] extends string ? K : never
}[keyof CSSStyleDeclaration & string]

export type Styles = { readonly [K in StyleNames]?: Attribute<string | number | null> } & {
  readonly [custom: `--${string}`]: Attribute<string | number | null>
}

export type Classes = Readonly<Record<string, Attribute<boolean>>>

type Common = {
  readonly children?: Children
  readonly class?: Attribute<string> | Classes
  readonly style?: Attribute<string> | Styles
  readonly for?: Attribute<string>
  readonly role?: Attribute<string>
} & {
  readonly [name: `aria-${string}` | `data-${string}`]: Attribute<string | number | boolean | null>
}

type SvgAttributeNames =
  | "viewBox"
  | "xmlns"
  | "d"
  | "x"
  | "y"
  | "x1"
  | "y1"
  | "x2"
  | "y2"
  | "cx"
  | "cy"
  | "r"
  | "rx"
  | "ry"
  | "dx"
  | "dy"
  | "width"
  | "height"
  | "points"
  | "transform"
  | "fill"
  | "stroke"
  | "opacity"
  | "offset"
  | "mask"
  | "filter"
  | "href"
  | "id"
  | "tabindex"
  | "gradientUnits"
  | "gradientTransform"
  | "patternUnits"
  | "preserveAspectRatio"
  | "markerWidth"
  | "markerHeight"
  | "refX"
  | "refY"
  | "orient"
  | "stroke-width"
  | "stroke-linecap"
  | "stroke-linejoin"
  | "stroke-dasharray"
  | "stroke-dashoffset"
  | "stroke-opacity"
  | "fill-opacity"
  | "fill-rule"
  | "clip-rule"
  | "clip-path"
  | "stop-color"
  | "stop-opacity"
  | "text-anchor"
  | "dominant-baseline"
  | "font-size"
  | "font-family"
  | "font-weight"

type SvgAttributes = { readonly [K in SvgAttributeNames]?: Attribute<string | number> }

type HtmlElements = {
  readonly [Tag in keyof HTMLElementTagNameMap]: Common &
    Properties<HTMLElementTagNameMap[Tag]> &
    Events<HTMLElementTagNameMap[Tag], HTMLElementEventMap>
}

type SvgElements = {
  readonly [Tag in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: Common &
    SvgAttributes &
    Events<SVGElementTagNameMap[Tag], SVGElementEventMap>
}

export declare namespace JSX {
  type Element = SparElement
  type ElementType = keyof IntrinsicElements | View<never>
  type ElementChildrenAttribute = { readonly children: unknown }
  type IntrinsicElements = HtmlElements & SvgElements
}

export const jsx = <Props extends Readonly<Record<string, unknown>>>(
  tag: string | View<Props>,
  props: Props,
): SparElement => (Predicate.isString(tag) ? intrinsic(tag, props) : tag(props))

export const jsxs = jsx

export const jsxDEV = jsx

export const Fragment = (props: { readonly children?: Children }): SparElement =>
  fragment([props.children])
