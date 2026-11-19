import { Schema } from "effect"
import { View } from "spar"
export const ListView = View.make(
  "ListView",
  { items: Schema.Array(Schema.String) },
  ({ items }) => (
    <ul>
      {items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  ),
)
