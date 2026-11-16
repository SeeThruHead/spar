import { Array, Effect, Exit, Option, Predicate, Queue, Ref, Scope, Stream } from "effect"
import { run, toAction } from "./action.ts"
import type { Action } from "./action.ts"
import * as Dom from "./dom.ts"
import { TypeId, isElement } from "./element.ts"
import type { Element, Row } from "./element.ts"
import { isReactive } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"

type Entry = {
  readonly key: string
  readonly start: Node
  readonly end: Node
  readonly scope: Scope.Closeable
}

const isEventName = (name: string): boolean => /^on[A-Z]/.test(name)

const insert = (parent: Node, node: Node, before: Node | null): Effect.Effect<void> =>
  Effect.sync(() => Dom.insert(parent, node, before))

const bind = <A>(
  source: Reactive<A>,
  apply: (value: A) => void,
): Effect.Effect<void, never, Scope.Scope> =>
  source.get.pipe(
    Effect.map(apply),
    Effect.andThen(
      Effect.forkScoped(
        Stream.runForEach(source.changes, (value) => Effect.sync(() => apply(value))),
        { startImmediately: true },
      ),
    ),
    Effect.asVoid,
  )

const actions = (node: HTMLElement, type: string, handler: unknown): Stream.Stream<Action> =>
  Stream.callback<Action>((queue) => {
    const listener = (event: Event): void => {
      Queue.offerUnsafe(queue, toAction(handler, event))
    }

    return Effect.acquireRelease(
      Effect.sync(() => node.addEventListener(type, listener)),
      () => Effect.sync(() => node.removeEventListener(type, listener)),
    )
  })

const listen = (
  node: HTMLElement,
  name: string,
  handler: unknown,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.forkScoped(Stream.runForEach(actions(node, name.slice(2).toLowerCase(), handler), run), {
    startImmediately: true,
  }).pipe(Effect.asVoid)

const applyProp = (
  node: HTMLElement,
  name: string,
  value: unknown,
): Effect.Effect<void, never, Scope.Scope> => {
  if (name === "children") return render(value, node, null)
  if (isEventName(name)) return listen(node, name, value)
  if (isReactive(value)) return bind(value, (current) => Dom.setAttribute(node, name, current))

  return Effect.sync(() => Dom.setAttribute(node, name, value))
}

const renderText = (
  source: Reactive<unknown>,
  parent: Node,
  before: Node | null,
): Effect.Effect<void, never, Scope.Scope> => {
  const node = document.createTextNode("")

  return bind(source, (value) => Dom.setText(node, value)).pipe(
    Effect.andThen(insert(parent, node, before)),
  )
}

const renderIntrinsic = (
  tag: string,
  props: Readonly<Record<string, unknown>>,
  parent: Node,
  before: Node | null,
): Effect.Effect<void, never, Scope.Scope> => {
  const node = document.createElement(tag)

  return Effect.forEach(Object.entries(props), ([name, value]) => applyProp(node, name, value), {
    discard: true,
  }).pipe(Effect.andThen(insert(parent, node, before)))
}

const createEntry = Effect.fnUntraced(function* (
  row: Row,
  parent: Node,
  anchor: Node,
  parentScope: Scope.Scope,
) {
  const scope = yield* Scope.fork(parentScope)
  const start = document.createComment("")
  const end = document.createComment("")

  yield* insert(parent, start, anchor)
  yield* insert(parent, end, anchor)

  const element = yield* Scope.provide(row.mount, scope)
  yield* Scope.provide(render(element, parent, end), scope)

  return { key: row.key, start, end, scope } satisfies Entry
})

const removeEntry = (parent: Node, entry: Entry): Effect.Effect<void> =>
  Scope.close(entry.scope, Exit.void).pipe(
    Effect.andThen(Effect.sync(() => Dom.removeSpan(parent, entry.start, entry.end))),
  )

const renderKeyed = Effect.fnUntraced(function* (
  rows: Reactive<ReadonlyArray<Row>>,
  parent: Node,
  before: Node | null,
) {
  const anchor = document.createComment("")
  const scope = yield* Effect.scope
  const entries = yield* Ref.make<ReadonlyArray<Entry>>([])

  const reconcile = Effect.fnUntraced(function* (next: ReadonlyArray<Row>) {
    const previous = yield* Ref.get(entries)
    const keys = new Set(next.map((row) => row.key))
    const removed = previous.filter((entry) => !keys.has(entry.key))

    yield* Effect.forEach(removed, (entry) => removeEntry(parent, entry), { discard: true })

    const current = yield* Effect.forEach(next, (row) =>
      Option.match(
        Array.findFirst(previous, (entry) => entry.key === row.key),
        {
          onNone: () => createEntry(row, parent, anchor, scope),
          onSome: (entry) => Effect.succeed(entry),
        },
      ),
    )

    yield* Effect.sync(() => Dom.placeSpans(parent, current, anchor))
    yield* Ref.set(entries, current)
  })

  yield* insert(parent, anchor, before)

  const initial = yield* rows.get
  yield* reconcile(initial)
  yield* Effect.forkScoped(Stream.runForEach(rows.changes, reconcile), { startImmediately: true })
})

const renderElement = (
  element: Element,
  parent: Node,
  before: Node | null,
): Effect.Effect<void, never, Scope.Scope> => {
  if (element[TypeId] === "Intrinsic") {
    return renderIntrinsic(element.tag, element.props, parent, before)
  }
  if (element[TypeId] === "Fragment") return render(element.children, parent, before)

  return renderKeyed(element.rows, parent, before)
}

export const render = (
  child: unknown,
  parent: Node,
  before: Node | null,
): Effect.Effect<void, never, Scope.Scope> => {
  if (Predicate.isString(child) || Predicate.isNumber(child)) {
    return insert(parent, document.createTextNode(Dom.toText(child)), before)
  }
  if (isReactive(child)) return renderText(child, parent, before)
  if (Array.isArray(child)) {
    return Effect.forEach(child, (item) => render(item, parent, before), { discard: true })
  }
  if (isElement(child)) return renderElement(child, parent, before)

  return Effect.void
}
