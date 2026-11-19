import { Schema } from "effect"
import { Router } from "spar"

const profile = Router.route("/settings/profile")

export const more = Router.under(profile, "/more", Schema.Struct({}))
