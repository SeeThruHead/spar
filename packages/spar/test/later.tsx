import { Schema } from "effect"
import { View } from "spar"

export const LaterView = View.make("LaterView", { id: Schema.String }, ({ id }) => (
  <h1>Loaded later: {id}</h1>
))
