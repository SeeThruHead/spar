import { Effect } from "effect"
import { Reactive } from "spar"

Effect.runFork(
  Effect.map(Reactive.succeed("ready").get, (text) => {
    document.body.append(text)
  }),
)
