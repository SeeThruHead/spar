import { Schema } from "effect"
import { View } from "spar"

export const MappedView = View.make(
  "MappedView",
  { items: Schema.Array(Schema.String) },
  ({ items }) => (
    <ul>
      {items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  ),
)
