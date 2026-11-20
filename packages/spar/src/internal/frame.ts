import { Context } from "effect"
import * as Diagnostics from "./said.ts"

export class Frame extends Context.Service<
  Frame,
  { readonly target: HTMLElement; readonly overlays: HTMLElement }
>()("spar/Frame") {}

export class OverlayLayer extends Context.Service<
  OverlayLayer,
  { readonly element: HTMLElement }
>()("spar/OverlayLayer") {}

export const noPage: Context.Service.Shape<typeof Frame> = {
  get target(): HTMLElement {
    throw new Error(Diagnostics.text("SPAR_NO_PAGE_ON_SERVER"))
  },
  get overlays(): HTMLElement {
    throw new Error(Diagnostics.text("SPAR_NO_PAGE_ON_SERVER"))
  },
}
