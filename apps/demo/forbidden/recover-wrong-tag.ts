import { View } from "spar"
import { ThreadErrorView } from "../src/mail/ThreadView.tsx"

export const recoverByName = View.recover("ThreadLoadFailed", ThreadErrorView)
