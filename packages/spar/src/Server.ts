import { Effect } from "effect"
import type { Layer } from "effect"
import { Frame, noPage } from "./internal/frame.ts"
import { toHtml } from "./internal/html.ts"
import { OnServer } from "./internal/server.ts"
import { Tree, UiTree } from "./internal/uiTree.ts"
import type { NoProps } from "./App.ts"
import type { Component } from "./View.ts"

export const renderToString = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: { readonly layer: Layer.Layer<NoInfer<Exclude<R, Frame>>, LayerError> },
): Effect.Effect<string, LayerError> =>
  component
    .mount({})
    .pipe(
      Effect.flatMap(toHtml),
      Effect.provideService(Frame, noPage),
      Effect.provide(options.layer),
      Effect.provideService(OnServer, true),
      Effect.provideService(UiTree, new Tree()),
      Effect.scoped,
    )
