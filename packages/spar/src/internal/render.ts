import {
  Array as Arr,
  Effect,
  Exit,
  Option,
  Predicate,
  Queue,
  Ref,
  Scheduler,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect"
import { toAction } from "./action.ts"
import type { Action } from "./action.ts"
import * as Cell from "./cell.ts"
import { report } from "./crash.ts"
import * as Dom from "./dom.ts"
import { HandleTypeId, isHandle } from "./handle.ts"
import type { Handle } from "./handle.ts"
import { TypeId, isElement } from "./element.ts"
import type { Element, Intrinsic, Rows } from "./element.ts"
import { starter } from "./listen.ts"
import { settled } from "./order.ts"
import { Observe, fromCell, isReactive } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"

export class DuplicateKey extends Schema.TaggedError<
  DuplicateKey,
  { readonly brand: unique symbol }
>()("DuplicateKey", { keys: Schema.Array(Schema.String) }) {
  override get message() {
    return `A keyed list has rows that share a key: ${this.keys.join(", ")}. Each row needs its own key.`
  }
}

type Entry<A> = Dom.Span & {
  readonly key: string
  readonly scope: Scope.Closeable
  readonly owner: Cell.Owner
  readonly cell: Cell.Cell<A>
}

type Target = {
  readonly parent: Node
  readonly before: Node | null
  readonly namespace: Dom.Namespace
}

type Place = Target & {
  readonly owner: Cell.Owner
  readonly start: (action: Action) => void
  readonly crashed: (defect: unknown) => void
}

const isEventName = (name: string): boolean => /^on[A-Z]/.test(name)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isReadonlyObject(value) && !isReactive(value)

const insert = (node: Node, place: Place): Effect.Effect<void> =>
  Effect.sync(() => Dom.insert(place.parent, node, place.before))

const bind = <A>(
  source: Reactive<A>,
  write: (value: A) => void,
  place: Place,
): Effect.Effect<void> =>
  Effect.flatMap(source.get, (initial) => {
    write(initial)

    return Effect.map(source[Observe](write, place.crashed), (stop) => Cell.own(place.owner, stop))
  })

const apply = (
  value: unknown,
  write: (value: unknown) => void,
  place: Place,
): Effect.Effect<void> => {
  if (isReactive(value)) return bind(value, write, place)

  return Effect.sync(() => write(value))
}

const applyEach = (
  entries: Readonly<Record<string, unknown>>,
  write: (name: string, value: unknown) => void,
  place: Place,
): Effect.Effect<void> =>
  Effect.forEach(
    Object.entries(entries),
    ([name, value]) => apply(value, (current) => write(name, current), place),
    { discard: true },
  )

const attach = (node: Dom.Host, handle: Handle): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(SubscriptionRef.set(handle[HandleTypeId], Option.some(node)), () =>
    SubscriptionRef.set(handle[HandleTypeId], Option.none()),
  )

const listen = (
  node: Dom.Host,
  type: string,
  handler: unknown,
  place: Place,
): Effect.Effect<void> =>
  Effect.sync(() =>
    Cell.own(
      place.owner,
      Dom.listen(node, type, (event) => place.start(toAction(handler, event))),
    ),
  )

const childNamespace = (tag: string, namespace: Dom.Namespace): Dom.Namespace => {
  if (tag === "foreignObject") return "html"

  return namespace
}

const applyProp = (
  node: Dom.Host,
  name: string,
  value: unknown,
  place: Place,
): Effect.Effect<void, never, Scope.Scope> => {
  if (name === "children") return render(value, { ...place, parent: node, before: null })
  if (isEventName(name)) return listen(node, name.slice(2).toLowerCase(), value, place)
  if (isHandle(value)) return attach(node, value)
  if (name === "class" && isRecord(value)) {
    return applyEach(value, (names, on) => Dom.toggleClass(node, names, on), place)
  }
  if (name === "style" && isRecord(value)) {
    return applyEach(value, (property, current) => Dom.setStyle(node, property, current), place)
  }

  return apply(value, (current) => Dom.setAttribute(node, name, current), place)
}

const renderText = (source: Reactive<unknown>, place: Place): Effect.Effect<void> => {
  const node = document.createTextNode("")

  return bind(source, (value) => Dom.setText(node, value), place).pipe(
    Effect.andThen(insert(node, place)),
  )
}

const childrenFirst = (
  props: ReadonlyArray<[string, unknown]>,
): ReadonlyArray<[string, unknown]> => [
  ...props.filter(([name]) => name === "children"),
  ...props.filter(([name]) => name !== "children"),
]

const within = (place: Place, namespace: Dom.Namespace): Place => {
  if (place.namespace === namespace) return place

  return { ...place, namespace }
}

const renderIntrinsic = Effect.fnUntraced(function* (element: Intrinsic, place: Place) {
  const namespace = element.tag === "svg" ? "svg" : place.namespace
  const node = Dom.create(element.tag, namespace)
  const inside = within(place, childNamespace(element.tag, namespace))

  yield* Effect.forEach(
    childrenFirst(Object.entries(element.props)),
    ([name, value]) => applyProp(node, name, value, inside),
    { discard: true },
  )
  yield* insert(node, place)

  return node
})

const createBetweenMarkers = Effect.fnUntraced(function* (element: Element, place: Place) {
  const start = document.createComment("")
  const end = document.createComment("")

  yield* insert(start, place)
  yield* insert(end, place)
  yield* render(element, { ...place, before: end })

  return { start, end }
})

const createSpan = (
  element: Element,
  place: Place,
): Effect.Effect<Dom.Span, never, Scope.Scope> => {
  if (element[TypeId] !== "Intrinsic") return createBetweenMarkers(element, place)

  return Effect.map(renderIntrinsic(element, place), (node) => ({ start: node, end: node }))
}

type Owned = { readonly scope: Scope.Closeable; readonly owner: Cell.Owner }

const closeEntry = (entry: Owned): Effect.Effect<void> =>
  Effect.andThen(
    Scope.close(entry.scope, Exit.void),
    Effect.sync(() => Cell.release(entry.owner)),
  )

const removeEntry = <A>(entry: Entry<A>): Effect.Effect<void> =>
  Effect.andThen(
    closeEntry(entry),
    Effect.sync(() => Dom.removeSpan(entry)),
  )

const createEntry = <A>(
  rows: Rows<A>,
  key: string,
  item: A,
  place: Place,
): Effect.Effect<Entry<A>> => {
  const scope = Scope.makeUnsafe()
  const owner = Cell.owner()
  const cell = Cell.make(item)

  return rows.mount(key, fromCell(cell)).pipe(
    Effect.flatMap((element) => createSpan(element, { ...place, owner })),
    Effect.map((span): Entry<A> => ({ start: span.start, end: span.end, key, scope, owner, cell })),
    Effect.onError(() => closeEntry({ scope, owner })),
    Scope.provide(scope),
  )
}

const repeated = (keys: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(keys.filter((key, index) => keys.indexOf(key) !== index)),
]

const renderRows = Effect.fnUntraced(function* <A>(rows: Rows<A>, place: Place) {
  const anchor = document.createComment("")
  const inside: Place = { ...place, before: anchor }
  const entries = yield* Ref.make<ReadonlyArray<Entry<A>>>([])

  const reconcile = Effect.fnUntraced(
    function* (next: ReadonlyArray<A>) {
      const previous = yield* Ref.get(entries)
      const nextKeys = next.map(rows.key)
      const keys = new Set(nextKeys)

      if (keys.size !== next.length) {
        return yield* Effect.die(new DuplicateKey({ keys: repeated(nextKeys) }))
      }

      const kept = previous.filter((entry) => keys.has(entry.key))
      const positions = new Map(kept.map((entry, position) => [entry.key, { entry, position }]))

      yield* Effect.forEach(
        previous.filter((entry) => !keys.has(entry.key)),
        removeEntry,
        { discard: true },
      )

      const placed = yield* Effect.forEach(Arr.zip(nextKeys, next), ([key, item], index) => {
        const existing = positions.get(key)
        if (existing === undefined) {
          return Effect.map(createEntry(rows, key, item, inside), (entry) => ({
            entry,
            position: kept.length + index,
          }))
        }

        return Effect.sync(() => {
          existing.entry.cell.write(item)

          return existing
        })
      })
      const current = placed.map((each) => each.entry)
      const staying = settled(placed.map((each) => each.position))

      yield* Effect.sync(() => Dom.placeSpans(place.parent, current, staying, anchor))
      yield* Ref.set(entries, current)
    },
    Effect.provideService(Scheduler.PreventSchedulerYield, true),
  )

  yield* insert(anchor, place)
  yield* Effect.addFinalizer(() =>
    Effect.flatMap(Ref.get(entries), (all) => Effect.forEach(all, closeEntry, { discard: true })),
  )

  const latest = yield* Queue.sliding<ReadonlyArray<A>>(1)
  const initial = yield* rows.items.get

  yield* reconcile(initial)
  yield* Effect.acquireRelease(
    rows.items[Observe]((next) => {
      Queue.offerUnsafe(latest, next)
    }, place.crashed),
    (stop) => Effect.sync(stop),
  )
  yield* Effect.forkScoped(
    Effect.tapDefect(Stream.runForEach(Stream.fromQueue(latest), reconcile), report),
    { startImmediately: true },
  )
})

const renderElement = (element: Element, place: Place): Effect.Effect<void, never, Scope.Scope> => {
  if (element[TypeId] === "Intrinsic") return Effect.asVoid(renderIntrinsic(element, place))
  if (element[TypeId] === "Fragment") return render(element.children, place)
  if (element[TypeId] === "Portal") {
    return render(element.child, {
      ...place,
      parent: element.layer,
      before: null,
      namespace: "html",
    })
  }

  return element.open((rows) => renderRows(rows, place))
}

const render = (child: unknown, place: Place): Effect.Effect<void, never, Scope.Scope> => {
  if (Predicate.isString(child) || Predicate.isNumber(child)) {
    return insert(document.createTextNode(Dom.toText(child)), place)
  }
  if (isReactive(child)) return renderText(child, place)
  if (Array.isArray(child)) {
    return Effect.forEach(child, (item) => render(item, place), { discard: true })
  }
  if (isElement(child)) return renderElement(child, place)

  return Effect.void
}

export const renderInto = Effect.fnUntraced(function* (child: unknown, target: Target) {
  const start = yield* starter()
  const owner = Cell.owner()

  yield* Effect.addFinalizer(() => Effect.sync(() => Cell.release(owner)))
  yield* render(child, {
    ...target,
    owner,
    start,
    crashed: (defect) => start(report(defect)),
  })
})
