import { Duration, Effect } from "effect"
import { rendered } from "./render-page.tsx"

const timed = Effect.gen(function* () {
  const first = yield* rendered

  yield* Effect.forEach(Array.from({ length: 20 }), () => rendered, { discard: true })

  const times = yield* Effect.forEach(Array.from({ length: 200 }), () =>
    Effect.map(Effect.timed(rendered), ([took]) => Duration.toMillis(took)),
  )
  const sorted = times.toSorted((a, b) => a - b)

  return { size: first.length, median: sorted[Math.floor(sorted.length / 2)] ?? 0 }
})

const { size, median } = await Effect.runPromise(timed)

console.log(
  `Server render of a 1,000-row list (${size} characters): median ${median.toFixed(2)} ms over 200 renders`,
)
