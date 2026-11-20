import { Context, Effect, Option } from "effect"
import * as Diagnostics from "./said.ts"
import { ViewScope, pathOf } from "./viewScope.ts"

export type Where = { readonly in: ReadonlyArray<string>; readonly at: string }

export type Report = (defect: unknown, where: Where) => Effect.Effect<void>

const logged: Report = (defect, where) =>
  Effect.logError(Diagnostics.text("SPAR_PART_CRASHED", where), defect)

export const CrashReporter = Context.Reference<Report>("spar/CrashReporter", {
  defaultValue: () => logged,
})

const nowhere = { displayName: "", at: "" }

export const report = Effect.fnUntraced(function* (
  defect: unknown,
  part: { readonly displayName: string; readonly at: string } = nowhere,
) {
  const reporter = yield* CrashReporter
  const around = yield* Effect.serviceOption(ViewScope)
  const owners = Option.match(around, { onNone: () => [], onSome: pathOf })

  yield* reporter(defect, {
    in: [...owners, ...(part.displayName === "" ? [] : [part.displayName])],
    at: part.at,
  })
})
