import { Props, View } from "spar"
import { Org } from "./Deep.ts"

export const DeepLoadingView = View.make("DeepLoadingView", { params: Props.Reactive(Org) }, () => (
  <p role="status">Loading the page</p>
))
