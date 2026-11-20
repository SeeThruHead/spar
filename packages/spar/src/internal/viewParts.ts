import { Context, Duration, Effect, Layer, Option, Scope } from "effect"
import { TypeId, isComponent } from "./component.ts"
import { placedHere } from "./placed.ts"
import type { Element } from "./element.ts"
import { RowKey, UiTree } from "./uiTree.ts"
import { ViewScope, pathOf } from "./viewScope.ts"
import * as Timeline from "../Timeline.ts"
import type { Component, Declared, Mountable, View } from "../View.ts"

type Anything = object | string | number | boolean | bigint | symbol | null | undefined

export function component<Props, E, R, ViewProps>(
  view: View<ViewProps> & Declared,
  mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>,
): Component<Props, E, R, ViewProps>
export function component(
  view: View<never> & Declared,
  mount: (props: Anything) => Effect.Effect<Element, Anything, Scope.Scope>,
): unknown {
  return Object.assign(
    (props: Anything) => placedHere(view.displayName, Effect.orDie(mount(props))),
    { [TypeId]: TypeId, view, mount },
  )
}

export const viewOf = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): View<ViewProps> & Declared => (isComponent(mountable) ? mountable.view : mountable)

export const child = <Props, E = never, R = never, ViewProps = never>(
  mountable: Mountable<Props, E, R, ViewProps>,
  props: Props,
): Effect.Effect<Element, E, R | Scope.Scope> => {
  if (isComponent(mountable)) return mountable.mount(props)

  return Effect.sync(() => mountable(props))
}

type Outside<Requirements> = Exclude<Exclude<Requirements, ViewScope>, Scope.Scope>

const labelled = (name: string, key: string | undefined): string =>
  key === undefined ? name : `${name}[${key}]`

export const inViewScope = <A, E, Requirements>(
  effect: Effect.Effect<A, E, Requirements>,
  name: string,
  at: string,
): Effect.Effect<A, E, Outside<Requirements> | Scope.Scope> =>
  Effect.flatMap(Effect.context<Scope.Scope>(), (context) => {
    const scope = Context.get(context, Scope.Scope)

    return effect.pipe(
      Effect.provideService(ViewScope, {
        parent: Context.getOrUndefined(context, ViewScope),
        label: labelled(name, Context.get(context, RowKey)),
        at,
        scope,
        tree: Context.get(context, UiTree),
      }),
      Effect.provideService(RowKey, undefined),
      Effect.provideService(Scope.Scope, scope),
    )
  })

export const SlowAfter = Context.Reference<number>("spar/View/SlowAfter", {
  defaultValue: () => 16,
})

export const noticed = <A, E, R>(
  name: string,
  at: string,
  made: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ViewScope> =>
  Effect.flatMap(
    Effect.all([Effect.timed(made), Effect.service(ViewScope), Effect.service(SlowAfter)]),
    ([[took, value], mounted, slowAfter]) => {
      const millis = Math.round(Duration.toMillis(took))
      if (millis < slowAfter) return Effect.succeed(value)

      return Effect.as(
        Effect.andThen(
          Effect.annotateCurrentSpan("spar.waited_ms", millis),
          Timeline.note("waited", name, () => ({
            millis,
            code: "SPAR_COMPONENT_WAITED",
            in: pathOf(mounted).join(" > "),
            at,
          })),
        ),
        value,
      )
    },
  )

const placeOf = (parent: ReadonlyArray<string>, taken: string, mark: string): string =>
  [...parent, taken.replace(` ${mark}`, "")].join(" / ")

export const within =
  <Provided, EL, RL>(layerAt: (place: string) => Layer.Layer<Provided, EL, RL>, mark: string) =>
  <Props, E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E | EL, Exclude<R, Provided | Scope.Scope> | RL, ViewProps> =>
    component(viewOf(self), (props) =>
      Effect.flatMap(Effect.context<Scope.Scope>(), (context) => {
        const scope = Context.get(context, Scope.Scope)
        const tree = Context.get(context, UiTree)
        const parent = Option.match(Context.getOption(context, ViewScope), {
          onNone: () => [],
          onSome: pathOf,
        })
        const label = labelled(viewOf(self).displayName, Context.get(context, RowKey))
        const { place } = tree.enter({}, () => [...parent, `${label} ${mark}`])

        return Scope.addFinalizer(
          scope,
          Effect.sync(() => tree.leave(place)),
        ).pipe(
          Effect.andThen(
            Layer.buildWithScope(
              layerAt(placeOf(parent, place.path.slice(parent.length).join(""), mark)),
              scope,
            ),
          ),
          Effect.flatMap((built) =>
            Effect.provide(child(self, props), Context.add(built, Scope.Scope, scope)),
          ),
        )
      }),
    )
