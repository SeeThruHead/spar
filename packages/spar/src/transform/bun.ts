import type { BunPlugin } from "bun"
import { check, format } from "./check.ts"
import { named } from "./named.ts"

export const sparJsx: BunPlugin = {
  name: "spar-jsx",
  setup: (build) => {
    build.onLoad({ filter: /\.tsx?$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const violations = path.endsWith(".tsx") ? check(path, source) : []

      if (violations.length > 0) throw new Error(format(violations))

      return {
        contents: named(path, source) ?? source,
        loader: path.endsWith(".tsx") ? "tsx" : "ts",
      }
    })
  },
}
