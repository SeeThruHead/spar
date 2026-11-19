import { Schema } from "effect"
import { Props, View } from "spar"
import { Tooltip } from "../src/index.ts"

export const OverlayKitView = View.make(
  "OverlayKitView",
  {
    remove: Tooltip.Tooltip,
    archive: Tooltip.Tooltip,
    popover: Props.Element,
    size: Props.Element,
    colour: Props.Element,
    chosen: Props.Reactive(Schema.String),
  },
  ({ remove, archive, popover, size, colour, chosen }) => (
    <main>
      <button type="button" {...remove.trigger}>
        Delete
      </button>
      {remove.bubble}
      <button type="button" {...archive.trigger}>
        Archive
      </button>
      {archive.bubble}
      {popover}
      {size}
      {colour}
      <output aria-label="Chosen size">{chosen}</output>
    </main>
  ),
)
