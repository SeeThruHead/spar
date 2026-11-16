import { Effect, HashMap, Option, Ref } from "effect"
import * as Cell from "./internal/cell.ts"
import { inContext } from "./internal/context.ts"
import { keyed } from "./internal/element.ts"
import type { Element, Row } from "./internal/element.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { child } from "./View.ts"
import type { Mountable } from "./View.ts"

export { fromStream, fromSubscriptionRef, make, map, succeed } from "./internal/reactive.ts"
export type { Reactive } from "./internal/reactive.ts"
export { DuplicateKey } from "./internal/render.ts"

export const mapBy = <A, Props, R = never>(
  key: (item: A) => string,
  component: Mountable<Props, never, R>,
  toProps: (item: Reactive<A>, key: string) => Props,
) =>
  Effect.fnUntraced(function* (list: Reactive<ReadonlyArray<A>>) {
    const context = yield* Effect.context<R>()
    const mounted = yield* Ref.make(HashMap.empty<string, Cell.Cell<A>>())

    const mount = Effect.fnUntraced(function* (id: string, item: A) {
      const current = Cell.make(item)

      yield* Ref.update(mounted, HashMap.set(id, current))
      yield* Effect.addFinalizer(() => Ref.update(mounted, HashMap.remove(id)))

      return yield* inContext(child(component, toProps(fromCell(current), id)), context)
    })

    const refresh = (id: string, item: A): Effect.Effect<void> =>
      Effect.map(Ref.get(mounted), (all) => {
        Option.map(HashMap.get(all, id), (current) => current.write(item))
      })

    const row = (item: A): Row => ({
      key: key(item),
      mount: mount(key(item), item),
      refresh: refresh(key(item), item),
    })

    return keyed(map(list, (items) => items.map(row)))
  })

export const when =
  <Props, R = never>(component: Mountable<Props, never, R>, props: Props) =>
  (condition: Reactive<boolean>): Effect.Effect<Element, never, R> =>
    Effect.map(Effect.context<R>(), (context) =>
      keyed(
        map(condition, (shown): ReadonlyArray<Row> => {
          if (!shown) return []

          return [
            {
              key: "shown",
              mount: inContext(child(component, props), context),
              refresh: Effect.void,
            },
          ]
        }),
      ),
    )
