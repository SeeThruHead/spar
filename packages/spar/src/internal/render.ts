import {
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
import { report } from "./crash.ts"
import * as Dom from "./dom.ts"
import { HandleTypeId, isHandle } from "./handle.ts"
import type { Handle } from "./handle.ts"
import { TypeId, isElement } from "./element.ts"
import type { Element, Intrinsic, Row } from "./element.ts"
import { listen, starter } from "./listen.ts"
import { settled } from "./order.ts"
import { Observe, isReactive } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"

export class DuplicateKey extends Schema.TaggedError<
  DuplicateKey,
  { readonly brand: unique symbol }
>()("DuplicateKey", { keys: Schema.Array(Schema.String) }) {
  override get message() {
    return `A keyed list has rows that share a key: ${this.keys.join(", ")}. Each row needs its own key.`
  }
}

type Entry = Dom.Span & {
  readonly key: string
  readonly scope: Scope.Closeable
}

type Place = {
  readonly parent: Node
  readonly before: Node | null
  readonly namespace: Dom.Namespace
}

const isEventName = (name: string): boolean => /^on[A-Z]/.test(name)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isReadonlyObject(value) && !isReactive(value)

const insert = (node: Node, place: Place): Effect.Effect<void> =>
  Effect.sync(() => Dom.insert(place.parent, node, place.before))

const bind = Effect.fnUntraced(function* <A>(source: Reactive<A>, write: (value: A) => void) {
  const start = yield* starter()
  const initial = yield* source.get

  write(initial)
  yield* source[Observe](write, (defect) => start(report(defect)))
})

const apply = (
  value: unknown,
  write: (value: unknown) => void,
): Effect.Effect<void, never, Scope.Scope> => {
  if (isReactive(value)) return bind(value, write)

  return Effect.sync(() => write(value))
}

const applyEach = (
  entries: Readonly<Record<string, unknown>>,
  write: (name: string, value: unknown) => void,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.forEach(
    Object.entries(entries),
    ([name, value]) => apply(value, (current) => write(name, current)),
    { discard: true },
  )

const attach = (node: Dom.Host, handle: Handle): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(SubscriptionRef.set(handle[HandleTypeId], Option.some(node)), () =>
    SubscriptionRef.set(handle[HandleTypeId], Option.none()),
  )

const childNamespace = (tag: string, namespace: Dom.Namespace): Dom.Namespace => {
  if (tag === "foreignObject") return "html"

  return namespace
}

const applyProp = (
  node: Dom.Host,
  name: string,
  value: unknown,
  namespace: Dom.Namespace,
): Effect.Effect<void, never, Scope.Scope> => {
  if (name === "children") return render(value, { parent: node, before: null, namespace })
  if (isEventName(name)) return listen(node, name.slice(2).toLowerCase(), value)
  if (isHandle(value)) return attach(node, value)
  if (name === "class" && isRecord(value)) {
    return applyEach(value, (names, on) => Dom.toggleClass(node, names, on))
  }
  if (name === "style" && isRecord(value)) {
    return applyEach(value, (property, current) => Dom.setStyle(node, property, current))
  }

  return apply(value, (current) => Dom.setAttribute(node, name, current))
}

const renderText = (
  source: Reactive<unknown>,
  place: Place,
): Effect.Effect<void, never, Scope.Scope> => {
  const node = document.createTextNode("")

  return bind(source, (value) => Dom.setText(node, value)).pipe(Effect.andThen(insert(node, place)))
}

const renderIntrinsic = Effect.fnUntraced(function* (element: Intrinsic, place: Place) {
  const namespace = element.tag === "svg" ? "svg" : place.namespace
  const node = Dom.create(element.tag, namespace)

  yield* Effect.forEach(
    Object.entries(element.props),
    ([name, value]) => applyProp(node, name, value, childNamespace(element.tag, namespace)),
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

const createEntry = Effect.fnUntraced(function* (row: Row, place: Place, parent: Scope.Scope) {
  const scope = yield* Scope.fork(parent)
  const element = yield* Scope.provide(row.mount, scope)
  const span = yield* Scope.provide(createSpan(element, place), scope)

  return { ...span, key: row.key, scope } satisfies Entry
})

const removeEntry = (entry: Entry): Effect.Effect<void> =>
  Scope.close(entry.scope, Exit.void).pipe(Effect.andThen(Effect.sync(() => Dom.removeSpan(entry))))

const repeated = (keys: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(keys.filter((key, index) => keys.indexOf(key) !== index)),
]

const renderKeyed = Effect.fnUntraced(function* (rows: Reactive<ReadonlyArray<Row>>, place: Place) {
  const anchor = document.createComment("")
  const inside: Place = { ...place, before: anchor }
  const scope = yield* Effect.scope
  const entries = yield* Ref.make<ReadonlyArray<Entry>>([])

  const reconcile = Effect.fnUntraced(
    function* (next: ReadonlyArray<Row>) {
      const previous = yield* Ref.get(entries)
      const keys = new Set(next.map((row) => row.key))

      if (keys.size !== next.length) {
        return yield* Effect.die(new DuplicateKey({ keys: repeated(next.map((row) => row.key)) }))
      }

      const kept = previous.filter((entry) => keys.has(entry.key))
      const positions = new Map(kept.map((entry, position) => [entry.key, { entry, position }]))

      yield* Effect.forEach(
        previous.filter((entry) => !keys.has(entry.key)),
        removeEntry,
        { discard: true },
      )

      const placed = yield* Effect.forEach(next, (row, index) => {
        const existing = positions.get(row.key)
        if (existing !== undefined) return Effect.as(row.refresh, existing)

        return Effect.map(createEntry(row, inside, scope), (entry) => ({
          entry,
          position: kept.length + index,
        }))
      })
      const current = placed.map((each) => each.entry)
      const staying = settled(placed.map((each) => each.position))

      yield* Effect.sync(() => Dom.placeSpans(place.parent, current, staying, anchor))
      yield* Ref.set(entries, current)
    },
    Effect.provideService(Scheduler.PreventSchedulerYield, true),
  )

  yield* insert(anchor, place)

  const start = yield* starter()
  const latest = yield* Queue.sliding<ReadonlyArray<Row>>(1)
  const initial = yield* rows.get

  yield* reconcile(initial)
  yield* rows[Observe](
    (next) => {
      Queue.offerUnsafe(latest, next)
    },
    (defect) => start(report(defect)),
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
    return render(element.child, { parent: element.layer, before: null, namespace: "html" })
  }

  return renderKeyed(element.rows, place)
}

export const render = (child: unknown, place: Place): Effect.Effect<void, never, Scope.Scope> => {
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
