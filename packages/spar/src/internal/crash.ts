import { Context, Effect } from "effect"

export type Report = (defect: unknown) => Effect.Effect<void>

const logged: Report = (defect) => Effect.logError("A part of the page crashed", defect)

export const CrashReporter = Context.Reference<Report>("spar/CrashReporter", {
  defaultValue: () => logged,
})

export const report = Effect.fnUntraced(function* (defect: unknown) {
  const reporter = yield* CrashReporter

  yield* reporter(defect)
})
