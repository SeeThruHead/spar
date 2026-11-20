import { Effect } from "effect"

Effect.runFork(Effect.sync(() => document.body.append("ready")))
