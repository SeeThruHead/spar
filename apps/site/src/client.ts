import { Layer } from "effect"
import { Backend, Router } from "spar"
import { Shelves, queries } from "./Shelves.ts"

export const layer = Layer.provide(queries, Shelves.layerRemote(`${location.origin}/rpc`)).pipe(
  Layer.provide(Backend.layer),
  Layer.provideMerge(Router.Router.layerBrowser),
)
