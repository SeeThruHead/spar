import { Effect, Queue, Stream } from "effect"
import type { Schema } from "effect"
import * as Internal from "./uiTree.ts"

export const Tree = Internal.UiTree

export const makeTree = (): Internal.Tree => new Internal.Tree()

export const snapshot: Effect.Effect<Internal.Snapshot> = Effect.map(Effect.service(Tree), (tree) =>
  tree.uiSnapshot(),
)

export const restore = (taken: Internal.Snapshot): Effect.Effect<void> =>
  Effect.map(Effect.service(Tree), (tree) => tree.restore(taken))

export const put = (
  path: Internal.Path,
  name: string,
  value: Schema.Json,
): Effect.Effect<boolean> => Effect.map(Effect.service(Tree), (tree) => tree.put(path, name, value))

export const changes: Stream.Stream<Internal.Change> = Stream.unwrap(
  Effect.map(Effect.service(Tree), (tree) =>
    Stream.callback<Internal.Change>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => tree.subscribe((change) => Queue.offerUnsafe(queue, change))),
        (stop) => Effect.sync(stop),
      ),
    ),
  ),
)
