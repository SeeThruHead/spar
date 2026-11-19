import { View } from "spar"
import { Counter } from "../src/counter/Counter.ts"

export const PageView = View.make("PageView", {}, () => (
  <main>
    <Counter />
  </main>
))
