import * as App from "./app.ts"
import { check, format, isViewFile } from "./check.ts"
import { named } from "./named.ts"

const problemsIn = (source: string, id: string): string =>
  format([
    ...(isViewFile(id) ? check(id, source) : []),
    ...(App.isAppFile(id) ? App.check(id, source) : []),
  ])

const isSource = (id: string): boolean => /\.tsx?(\?|$)/.test(id) && !id.includes("/node_modules/")

export const sparJsx = {
  name: "spar-jsx",
  enforce: "pre",
  transform: (source: string, id: string): { readonly code: string; readonly map: null } | null => {
    const problems = problemsIn(source, id)
    if (problems !== "") throw new Error(problems)

    const code = isSource(id) ? named(id, source) : null

    return code === null ? null : { code, map: null }
  },
} as const
