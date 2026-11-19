import { Schema } from "effect"
import { Router } from "spar"

const team = Router.route("/teams/:team/*", Schema.Struct({ team: Schema.String }))

export const member = Router.under(
  team,
  "/members/:member",
  Schema.Struct({ member: Schema.String }),
)
