import { Layer } from "effect"
import { Backend, Router } from "spar"
import * as Loads from "./Loads.ts"
import { Shelves, queries } from "./Shelves.ts"

export const layer = Layer.merge(
  Layer.provide(queries, Shelves.layerRemote(`${location.origin}/rpc`)),
  Loads.queries,
).pipe(Layer.provide(Backend.layer), Layer.provideMerge(Router.Router.layerBrowser))
