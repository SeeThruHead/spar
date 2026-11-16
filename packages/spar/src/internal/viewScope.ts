import { Context } from "effect"

export class ViewScope extends Context.Service<ViewScope, { readonly mounted: true }>()(
  "spar/internal/ViewScope",
) {}
