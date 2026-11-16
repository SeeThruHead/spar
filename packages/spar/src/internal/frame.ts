import { Context } from "effect"

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
    throw new Error("There is no page on a server")
  },
  get overlays(): HTMLElement {
    throw new Error("There is no page on a server")
  },
}
