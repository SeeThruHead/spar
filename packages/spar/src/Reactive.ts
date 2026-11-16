import { Effect, HashMap, Option, Ref, SubscriptionRef } from "effect"
import type { Context, Scope } from "effect"
import { provideTo } from "./internal/context.ts"
import { keyed } from "./internal/element.ts"
import type { Element, Row } from "./internal/element.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { child } from "./View.ts"
import type { Mountable } from "./View.ts"

export { fromSubscriptionRef, make, map, succeed } from "./internal/reactive.ts"
export type { Reactive } from "./internal/reactive.ts"
export { DuplicateKey } from "./internal/render.ts"

const inContext = <R>(
  mount: Effect.Effect<Element, never, R | Scope.Scope>,
  context: Context.Context<R>,
): Effect.Effect<Element, never, Scope.Scope> =>
  provideTo<Element, never, R, Scope.Scope>(mount, context)

const replace = <A>(current: SubscriptionRef.SubscriptionRef<A>, item: A): Effect.Effect<void> =>
  Effect.flatMap(SubscriptionRef.get(current), (held) =>
    held === item ? Effect.void : SubscriptionRef.set(current, item),
  )

export const mapBy = <A, Props, R = never>(
  key: (item: A) => string,
  component: Mountable<Props, never, R>,
  toProps: (item: Reactive<A>) => Props,
) =>
  Effect.fnUntraced(function* (list: Reactive<ReadonlyArray<A>>) {
    const context = yield* Effect.context<R>()
    const mounted = yield* Ref.make(HashMap.empty<string, SubscriptionRef.SubscriptionRef<A>>())

    const mount = Effect.fnUntraced(function* (id: string, item: A) {
      const current = yield* SubscriptionRef.make(item)

      yield* Ref.update(mounted, HashMap.set(id, current))
      yield* Effect.addFinalizer(() => Ref.update(mounted, HashMap.remove(id)))

      return yield* inContext(child(component, toProps(fromSubscriptionRef(current))), context)
    })

    const refresh = (id: string, item: A): Effect.Effect<void> =>
      Effect.flatMap(Ref.get(mounted), (all) =>
        Effect.forEach(Option.toArray(HashMap.get(all, id)), (current) => replace(current, item), {
          discard: true,
        }),
      )

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
