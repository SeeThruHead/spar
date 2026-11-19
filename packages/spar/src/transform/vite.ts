import * as App from "./app.ts"
import { check, format, isViewFile } from "./check.ts"

const problemsIn = (source: string, id: string): string =>
  format([
    ...(isViewFile(id) ? check(id, source) : []),
    ...(App.isAppFile(id) ? App.check(id, source) : []),
  ])

export const sparJsx = {
  name: "spar-jsx",
  enforce: "pre",
  transform: (source: string, id: string): null => {
    const problems = problemsIn(source, id)
    if (problems !== "") throw new Error(problems)

    return null
  },
} as const
