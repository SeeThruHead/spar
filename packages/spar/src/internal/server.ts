import { Context } from "effect"
import * as Cell from "./cell.ts"

export const OnServer = Context.Reference<boolean>("spar/OnServer", { defaultValue: () => false })

export const Hydrating = Context.Reference<Cell.Cell<boolean>>("spar/Hydrating", {
  defaultValue: () => Cell.make(false),
})
