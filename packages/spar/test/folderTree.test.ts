import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { View } from "spar"
import * as Trees from "../src/internal/uiTrees.ts"
import * as Testing from "spar/testing"
import { FolderTree } from "./folderTree.tsx"

const root = {
  name: "home",
  folders: [
    { name: "music", folders: [{ name: "jazz", folders: [] }] },
    { name: "photos", folders: [] },
  ],
}

const Tree = View.mapProps(() => ({ root }))(FolderTree)

describe("a recursive component: a folder tree", () => {
  it.live("draws itself for each child folder, each with its own open state", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Tree)
      expect(yield* Testing.gone("button", "music")).toBeUndefined()

      yield* Testing.click("button", "home")
      yield* Testing.click("button", "music")
      yield* Testing.find("button", "jazz")

      const photos = yield* Testing.find("button", "photos")

      expect(photos.getAttribute("aria-expanded")).toBe("false")
      expect(photos.hasAttribute("disabled")).toBe(true)

      yield* Testing.click("button", "home")
      yield* Testing.gone("button", "music")
      yield* Testing.click("button", "home")
      yield* Testing.find("button", "music")

      const tree = yield* Trees.snapshot

      expect(
        tree
          .filter((piece) => piece.name === "open")
          .map((piece) => [piece.path.join(" / "), piece.value]),
      ).toEqual([
        ["FolderTree / FolderRow", true],
        ["FolderTree / FolderRow / FolderRow[music]", false],
        ["FolderTree / FolderRow / FolderRow[photos]", false],
      ])
    }).pipe(Effect.provideService(Trees.Tree, Trees.makeTree())),
  )
})
