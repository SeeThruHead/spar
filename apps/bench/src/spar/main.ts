import { Effect } from "effect"
import { App } from "spar"
import { Table } from "./Table.ts"
import { TableStore } from "./TableStore.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Table, { target, layer: TableStore.layer })
})

Effect.runFork(program)
