import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect } from "effect"
import { Command } from "effect/cli"
import { command } from "../src/cli.ts"

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
)
