import { Schema } from "effect"
import { View } from "spar"
export const BadgeView = View.make("BadgeView", { unread: Schema.Boolean }, ({ unread }) => (
  <span>{unread && "New"}</span>
))
