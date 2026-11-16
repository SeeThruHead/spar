import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { main, offendingLines } from "./attribution.ts"

const git = (args: ReadonlyArray<string>) =>
  Effect.promise(() =>
    new Response(Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "ignore" }).stdout).text(),
  )

const repoRoot = `${process.cwd()}/../..`

const guardFiles = new Set(["packages/lint/attribution.ts", "packages/lint/attribution.test.ts"])

const trackedText = Effect.gen(function* () {
  const files = (yield* git(["-C", repoRoot, "ls-files"]))
    .split("\n")
    .filter((file) => file.length > 0)
    .filter((file) => !guardFiles.has(file))

  return yield* Effect.forEach(
    files,
    (file) => Effect.promise(() => Bun.file(`${repoRoot}/${file}`).text()),
    { concurrency: 16 },
  )
})

const messageFile = (name: string, text: string) =>
  Effect.promise(async () => {
    const path = `${process.cwd()}/node_modules/.cache/attribution-${name}.txt`
    await Bun.write(path, text)

    return path
  })

describe("AI attribution guard", () => {
  it("flags attribution trailers and footers", () => {
    const message = [
      "Add a router",
      "",
      "Co-Authored-By: Claude <noreply@anthropic.com>",
      "Generated with Claude Code",
      "Claude-Session: https://claude.ai/code/session_01ABC",
      "https://claude.ai/code/session_01ABC",
    ].join("\n")

    assert.deepStrictEqual(offendingLines(message), message.split("\n").slice(2))
  })

  it("leaves ordinary messages alone", () => {
    assert.deepStrictEqual(
      offendingLines("Co-authored-by: Shane Keulen <sth@example.com>\nGenerated routes"),
      [],
    )
  })

  it.effect("no tracked file carries attribution", () =>
    Effect.gen(function* () {
      const texts = yield* trackedText

      assert.deepStrictEqual(texts.flatMap(offendingLines), [])
    }),
  )

  it.effect("no commit message in history carries attribution", () =>
    Effect.gen(function* () {
      const history = yield* git(["-C", repoRoot, "log", "--format=%B"])

      assert.deepStrictEqual(offendingLines(history), [])
    }),
  )
})

describe("attribution commit hook", () => {
  it.effect("accepts an ordinary message and rejects one with an AI trailer", () =>
    Effect.gen(function* () {
      const clean = yield* messageFile("clean", "Add a router\n")
      const tainted = yield* messageFile(
        "tainted",
        "Add a router\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
      )

      yield* main(["bun", "hook", clean])
      const error = yield* main(["bun", "hook", tainted]).pipe(Effect.flip)

      assert.strictEqual(error._tag, "AttributionFound")
      assert.include(error.message, "Co-Authored-By: Claude")
    }),
  )

  it.effect("explains a missing argument and an unreadable file", () =>
    Effect.gen(function* () {
      const usage = yield* main(["bun", "hook"]).pipe(Effect.flip)
      const unreadable = yield* main(["bun", "hook", "/nonexistent/COMMIT_EDITMSG"]).pipe(
        Effect.flip,
      )

      assert.strictEqual(usage._tag, "Usage")
      assert.include(usage.message, "<commit-message-file>")
      assert.strictEqual(unreadable._tag, "MessageUnreadable")
      assert.include(unreadable.message, "/nonexistent/COMMIT_EDITMSG")
    }),
  )
})
