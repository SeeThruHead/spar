import { check, format, isViewFile } from "./check.ts"

export const sparJsx = {
  name: "spar-jsx",
  enforce: "pre",
  transform: (source: string, id: string): null => {
    if (!isViewFile(id)) return null

    const violations = check(id, source)
    if (violations.length > 0) throw new Error(format(violations))

    return null
  },
} as const
