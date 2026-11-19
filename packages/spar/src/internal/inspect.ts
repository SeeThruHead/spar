import { Option, Predicate } from "effect"
import * as Cell from "./cell.ts"
import { TypeId, fragment, intrinsic, isElement } from "./element.ts"
import type { Element } from "./element.ts"
import type { Path } from "./uiTree.ts"
import type { Fields } from "../Props.ts"

export const mark = "data-spar-view"

export type Placed = { readonly path: Path; readonly services: ReadonlyArray<string> }

export type Seen = {
  readonly id: number
  readonly name: string
  readonly fields: Fields
  readonly props: unknown
  readonly placed: Option.Option<Placed>
  readonly recovers: ReadonlyArray<string>
}

const markedElement = (element: Element, id: number): Element => {
  if (element[TypeId] === "Fragment")
    return fragment(element.children.map((inner) => marked(inner, id)))
  if (element[TypeId] !== "Intrinsic") return element
  if (mark in element.props) return element

  return intrinsic(element.tag, { ...element.props, [mark]: id })
}

const marked = (child: unknown, id: number): unknown =>
  isElement(child) ? markedElement(child, id) : child

export class Inspecting {
  readonly seen = new Map<number, Seen>()
  readonly last = Cell.make(0)

  draw(name: string, fields: Fields, props: unknown, element: Element): Element {
    const id = this.last.read() + 1

    this.last.write(id)
    this.seen.set(id, { id, name, fields, props, placed: Option.none(), recovers: [] })

    return markedElement(element, id)
  }

  place(placed: Placed): void {
    Option.map(Option.fromUndefinedOr(this.seen.get(this.last.read())), (last) =>
      this.seen.set(last.id, { ...last, placed: Option.some(placed) }),
    )
  }

  recover(how: string): void {
    Option.map(Option.fromUndefinedOr(this.seen.get(this.last.read())), (last) =>
      this.seen.set(last.id, { ...last, recovers: [...last.recovers, how] }),
    )
  }

  find(id: number): Option.Option<Seen> {
    return Option.fromUndefinedOr(this.seen.get(id))
  }

  keepOnly(ids: ReadonlySet<number>): void {
    ;[...this.seen.keys()].filter((id) => !ids.has(id)).forEach((id) => this.seen.delete(id))
  }
}

export const inspecting = Cell.make<Option.Option<Inspecting>>(Option.none())

export const drawn = (name: string, fields: Fields, props: unknown, element: Element): Element =>
  Option.match(inspecting.read(), {
    onNone: () => element,
    onSome: (inspector) => inspector.draw(name, fields, props, element),
  })

export const placed = (path: () => Path, services: ReadonlyArray<string>): void => {
  Option.map(inspecting.read(), (inspector) => inspector.place({ path: path(), services }))
}

export const recovering = (failure: string, by: string): void => {
  Option.map(inspecting.read(), (inspector) => inspector.recover(`${failure} is shown by ${by}`))
}

const sources = new WeakMap<object, string>()

export const sourced = (value: object, label: string): void => {
  Option.map(inspecting.read(), () => sources.set(value, label))
}

export const sourceOf = (value: unknown): Option.Option<string> => {
  if (!Predicate.isObject(value)) return Option.none()

  const direct = Option.fromUndefinedOr(sources.get(value))
  if (Option.isSome(direct)) return direct
  if (!Predicate.hasProperty(value, "self")) return Option.none()

  return Option.map(sourceOf(value.self), (label) => `made from ${label.replace("made from ", "")}`)
}
