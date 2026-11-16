import { Context } from "effect"

export class Frame extends Context.Service<
  Frame,
  { readonly target: HTMLElement; readonly overlays: HTMLElement }
>()("spar/Frame") {}

export class OverlayLayer extends Context.Service<
  OverlayLayer,
  { readonly element: HTMLElement }
>()("spar/OverlayLayer") {}
