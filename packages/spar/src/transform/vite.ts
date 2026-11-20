import { readFileSync } from "node:fs"
import * as App from "./app.ts"
import { check, checkAll, format, isViewFile } from "./check.ts"
import { named } from "./named.ts"

const problemsIn = (source: string, id: string): string =>
  format([
    ...(isViewFile(id) ? check(id, source) : []),
    ...(App.isAppFile(id) ? App.check(id, source) : []),
  ])

const isSource = (id: string): boolean => /\.tsx?(\?|$)/.test(id) && !id.includes("/node_modules/")

const fileOf = (id: string): string => id.replace(/\?.*$/, "")

export const wholeProgram = (ids: ReadonlyArray<string>): string =>
  format(
    checkAll(
      ids
        .filter(isSource)
        .map(fileOf)
        .map((file) => ({ file, source: readFileSync(file, "utf8") })),
    ),
  )

export const sparJsx = {
  name: "spar-jsx",
  enforce: "pre",
  buildEnd(this: { readonly getModuleIds: () => Iterable<string> }) {
    const problems = wholeProgram([...this.getModuleIds()])
    if (problems !== "") throw new Error(problems)
  },
  transform: (source: string, id: string): { readonly code: string; readonly map: null } | null => {
    const problems = problemsIn(source, id)
    if (problems !== "") throw new Error(problems)

    const code = isSource(id) ? named(id, source) : null

    return code === null ? null : { code, map: null }
  },
} as const
