import { Context, Effect, Option } from "effect"
import * as Diagnostics from "./said.ts"
import * as Cell from "./cell.ts"
import { ViewScope } from "./viewScope.ts"

const current = Cell.make<Option.Option<Context.Context<never>>>(Option.none())

export const drawingIn = <A>(context: Context.Context<never>, draw: () => A): Effect.Effect<A> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const before = current.read()

      current.write(Option.some(context))

      return before
    }),
    () => Effect.sync(draw),
    (before) => Effect.sync(() => current.write(before)),
  )

export const drawingNow = <A>(context: Context.Context<never>, draw: () => A): A => {
  const before = current.read()

  current.write(Option.some(context))

  const drawn = draw()

  current.write(before)

  return drawn
}

const viewName = (label: string): string => label.replace(/(#\d+|\[.*\])$/, "")

export const drawingView = (): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.flatMap(current.read(), (context) => Context.getOption(context, ViewScope)),
      (mounted) => viewName(mounted.label),
    ),
  )

export const drawnHere = (): Context.Context<never> =>
  Option.getOrThrowWith(
    current.read(),
    () => new Error(Diagnostics.text("SPAR_COMPONENT_OUTSIDE_A_VIEW")),
  )
