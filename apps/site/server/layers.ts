import { Layer } from "effect"
import { Renderer, Router } from "spar"
import type { Content } from "../src/content.ts"
import { pageIn, searchIn } from "../src/library.ts"
import * as Loads from "../src/Loads.ts"
import { Shelves, queries } from "../src/Shelves.ts"

export const layer = (content: Content, url: string) =>
  Layer.mergeAll(
    Layer.provide(
      queries,
      Layer.succeed(Shelves, { page: pageIn(content), search: searchIn(content.sections) }),
    ),
    Loads.queries,
    Renderer.html,
  ).pipe(Layer.provideMerge(Router.Router.layerMemory(url)))
