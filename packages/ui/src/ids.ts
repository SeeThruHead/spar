import { Context, Effect, Ref } from "effect"

export const Ids = Context.Reference<{ readonly next: Effect.Effect<string> }>("@spar/ui/Ids", {
  defaultValue: () => {
    const count = Ref.makeUnsafe(0)

    return {
      next: Effect.map(
        Ref.updateAndGet(count, (last) => last + 1),
        (now) => `spar-${now}`,
      ),
    }
  },
})
