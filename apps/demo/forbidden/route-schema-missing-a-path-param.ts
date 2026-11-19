import { Schema } from "effect"
import { Router } from "spar"

export const thread = Router.route("/threads/:id", Schema.Struct({ page: Schema.String }))
