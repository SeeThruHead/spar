import { Router } from "spar"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const person = Router.route("/people/:name")

export const page = Router.on(person, ThreadSkeletonView)
