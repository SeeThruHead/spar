import type { BunPlugin } from "bun"
import { check, format } from "./check.ts"

export const sparJsx: BunPlugin = {
  name: "spar-jsx",
  setup: (build) => {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const violations = check(path, source)

      if (violations.length > 0) throw new Error(format(violations))

      return { contents: source, loader: "tsx" }
    })
  },
}
