import { Context } from "effect"
import type { Schema } from "effect"
import * as Cell from "./cell.ts"

export const OnServer = Context.Reference<boolean>("spar/OnServer", { defaultValue: () => false })

export const Seed = Context.Reference<Readonly<Record<string, Schema.Json>>>("spar/Store/Seed", {
  defaultValue: () => ({}),
})

export const Hydrating = Context.Reference<Cell.Cell<boolean>>("spar/Hydrating", {
  defaultValue: () => Cell.make(false),
})
