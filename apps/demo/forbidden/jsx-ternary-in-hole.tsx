import { Schema } from "effect"
import { View } from "spar"
export const PanelView = View.make("PanelView", { open: Schema.Boolean }, ({ open }) => (
  <section>{open ? <p>Open</p> : <p>Closed</p>}</section>
))
