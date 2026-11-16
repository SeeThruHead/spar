import { Effect } from "effect"
export const wrapped = (count: number) =>
  Effect.gen(function* () {
    const one = yield* Effect.succeed(count)
    const two = yield* Effect.succeed(one)

    return one + two
  })
