import { Context } from "effect"
import type { Scope } from "effect"
import type { Path, Tree } from "./uiTree.ts"

export type Mounted = {
  readonly parent: Mounted | undefined
  readonly label: string
  readonly scope: Scope.Scope
  readonly tree: Tree
}

export class ViewScope extends Context.Service<ViewScope, Mounted>()("spar/internal/ViewScope") {}

export const pathOf = (mounted: Mounted): Path =>
  mounted.parent === undefined ? [mounted.label] : [...pathOf(mounted.parent), mounted.label]
