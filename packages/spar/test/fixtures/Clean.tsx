import { Schema } from "effect"
import { View } from "spar"

export const CleanView = View.make("CleanView", { title: Schema.String }, ({ title }) => (
  <h1>{title}</h1>
))
