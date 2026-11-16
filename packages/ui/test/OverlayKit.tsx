import type { Element, Reactive } from "spar"
import type { Tooltip } from "../src/index.ts"

type Props = {
  readonly remove: Tooltip.Tooltip
  readonly archive: Tooltip.Tooltip
  readonly popover: Element
  readonly size: Element
  readonly colour: Element
  readonly chosen: Reactive.Reactive<string>
}

export const OverlayKitView = ({ remove, archive, popover, size, colour, chosen }: Props) => (
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
)
