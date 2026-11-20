import { Effect } from "effect"
import { App } from "spar"
import { TableStore } from "../spar/TableStore.ts"
import { Table } from "./Table.tsx"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Table, { target, layer: TableStore.layer() })
})

Effect.runFork(program)
