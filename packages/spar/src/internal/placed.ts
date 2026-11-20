import type { Effect, Scope } from "effect"
import { inContext } from "./context.ts"
import { drawnHere } from "./drawing.ts"
import { keyed } from "./element.ts"
import type { Element } from "./element.ts"
import { succeed } from "./reactive.ts"

export const placedHere = (
  name: string,
  mount: Effect.Effect<Element, never, Scope.Scope>,
): Element => {
  const context = drawnHere()

  return keyed({
    kind: "mounted",
    items: succeed([name]),
    key: (only: string) => only,
    mount: () => inContext(mount, context),
  })
}
