import { Schema } from "effect"
import { Props, View } from "spar"

export const TeaView = View.make("TeaView", { name: Props.Reactive(Schema.String) }, ({ name }) => (
  <output aria-label="Tea">{name}</output>
))

export const ShelfView = View.make("ShelfView", { page: Props.Element }, ({ page }) => (
  <main>{page}</main>
))

export const NothingView = View.make("NothingView", { path: Schema.String }, ({ path }) => (
  <p>{path}</p>
))
