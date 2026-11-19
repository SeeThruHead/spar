import { Schema } from "effect"
import { Router } from "spar"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const person = Router.route("/people/:name", Schema.Struct({ name: Schema.String }))

export const page = Router.on(person, ThreadSkeletonView)
