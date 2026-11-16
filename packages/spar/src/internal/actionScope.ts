import { Context, Scope } from "effect"

export const ActionScope = Context.Reference<Scope.Scope>("spar/internal/ActionScope", {
  defaultValue: Scope.makeUnsafe,
})
