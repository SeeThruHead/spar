import { Layer } from "effect"
import { Renderer, Router } from "spar"
import { Library } from "../src/api.ts"
import * as Loads from "../src/Loads.ts"
import { Shelves, queries } from "../src/Shelves.ts"
import type { Content } from "./content.ts"
import { pageIn, searchIn } from "./library.ts"

export const layer = (content: Content, url: string) =>
  Layer.mergeAll(
    Layer.provide(
      queries,
      Layer.succeed(Shelves, { page: pageIn(content), search: searchIn(content) }),
    ),
    Loads.queries,
    Renderer.html,
  ).pipe(Layer.provideMerge(Router.Router.layerMemory(url)))

export const LibraryLive = (content: Content) =>
  Library.toLayer({
    Page: ({ slug }) => pageIn(content)(slug),
    Search: ({ text }) => searchIn(content)(text),
  })
