import { Effect } from "effect"
import { isPlainView } from "./internal/component.ts"
import { inContext } from "./internal/context.ts"
import { keyed } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { map } from "./internal/reactive.ts"
import { RowKey } from "./internal/uiTree.ts"
import type { Reactive } from "./internal/reactive.ts"
import { child } from "./View.ts"
import type { Mountable } from "./View.ts"

export { fromStream, fromSubscriptionRef, make, map, succeed, zip } from "./internal/reactive.ts"
export type { Reactive } from "./internal/reactive.ts"
export { DuplicateKey } from "./internal/render.ts"

export const mapBy = <A, Props, R = never>(
  key: (item: A) => string,
  component: Mountable<Props, never, R>,
  toProps: (item: Reactive<A>, key: string) => Props,
) =>
  Effect.fnUntraced(function* (list: Reactive<ReadonlyArray<A>>) {
    const context = yield* Effect.context<R>()
    if (isPlainView(component)) {
      return keyed({
        kind: "drawn",
        items: list,
        key,
        draw: (id, item) => component(toProps(item, id)),
      })
    }

    return keyed({
      kind: "mounted",
      items: list,
      key,
      mount: (id, item) =>
        inContext(Effect.provideService(child(component, toProps(item, id)), RowKey, id), context),
    })
  })

const shown: ReadonlyArray<"shown"> = ["shown"]

export const when =
  <Props, R = never>(component: Mountable<Props, never, R>, props: Props) =>
  (condition: Reactive<boolean>): Effect.Effect<Element, never, R> =>
    Effect.map(Effect.context<R>(), (context) =>
      keyed({
        kind: "mounted",
        items: map(condition, (on) => (on ? shown : [])),
        key: (only: "shown") => only,
        mount: () => inContext(child(component, props), context),
      }),
    )
