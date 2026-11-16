import { Array, Effect, Option } from "effect"
import type { Context, Scope } from "effect"
import { provideTo } from "./internal/context.ts"
import { keyed } from "./internal/element.ts"
import type { Element, Row } from "./internal/element.ts"
import { map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { child } from "./View.ts"
import type { Mountable } from "./View.ts"

export { fromSubscriptionRef, make, map, succeed } from "./internal/reactive.ts"
export type { Reactive } from "./internal/reactive.ts"

const itemOf = <A>(
  list: Reactive<ReadonlyArray<A>>,
  key: (item: A) => string,
  initial: A,
): Reactive<A> =>
  map(list, (items) =>
    Option.getOrElse(
      Array.findFirst(items, (item) => key(item) === key(initial)),
      () => initial,
    ),
  )

const inContext = <R>(
  mount: Effect.Effect<Element, never, R | Scope.Scope>,
  context: Context.Context<R>,
): Effect.Effect<Element, never, Scope.Scope> =>
  provideTo<Element, never, R, Scope.Scope>(mount, context)

export const mapBy =
  <A, Props, R = never>(
    key: (item: A) => string,
    component: Mountable<Props, never, R>,
    toProps: (item: Reactive<A>) => Props,
  ) =>
  (list: Reactive<ReadonlyArray<A>>): Effect.Effect<Element, never, R> =>
    Effect.map(Effect.context<R>(), (context) =>
      keyed(
        map(list, (items) =>
          items.map((item): Row => ({
            key: key(item),
            mount: inContext(child(component, toProps(itemOf(list, key, item))), context),
          })),
        ),
      ),
    )

export const when =
  <Props, R = never>(component: Mountable<Props, never, R>, props: Props) =>
  (condition: Reactive<boolean>): Effect.Effect<Element, never, R> =>
    Effect.map(Effect.context<R>(), (context) =>
      keyed(
        map(condition, (shown): ReadonlyArray<Row> => {
          if (!shown) return []

          return [{ key: "shown", mount: inContext(child(component, props), context) }]
        }),
      ),
    )
