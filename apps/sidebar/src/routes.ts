import { Schema } from "effect"
import { Router } from "spar"

export const home = Router.route("/")

export const agentRoute = Router.route("/agents/:id", Schema.Struct({ id: Schema.String }))
