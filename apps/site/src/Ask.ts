import { Effect, Schema } from "effect"
import { Reactive, UiState, compose } from "spar"
import { AskView } from "./AskView.tsx"

const guide = "https://spar.seethruhead.vip/llms.txt"

const Choice = Schema.Literals(["short", "app"])

type Choice = typeof Choice.Type

const prompts: Readonly<Record<Choice, string>> = {
  short: `Read ${guide}. In under 200 words, explain what Spar is and list its key ideas, one line each. Use only what the page says, and say so when it does not cover something.`,
  app: `Read ${guide}. Then read the React app in this folder and say what it becomes in Spar: which state becomes stores, which fetches become queries, which writes go through the outbox, and which of its bugs Spar's rules would refuse. Use only what the page says about Spar.`,
}

const pressed = (now: Choice, mine: Choice): string => String(now === mine)

class CopyRefused extends Schema.TaggedError<CopyRefused, { readonly brand: unique symbol }>()(
  "CopyRefused",
  {
    cause: Schema.Defect(),
  },
) {}

const copied = (text: string): Effect.Effect<string> =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: (cause) => new CopyRefused({ cause }),
  }).pipe(
    Effect.match({
      onFailure: () => "Copying was refused here; select the text and copy it.",
      onSuccess: () => "Copied.",
    }),
  )

export const Ask = compose(
  Effect.fnUntraced(function* () {
    const chosen = yield* UiState.make("ask", Choice, "short")
    const said = yield* UiState.make("ask said", Schema.String, "")
    const choose = (choice: Choice) => [UiState.set(chosen, choice), UiState.set(said, "")]

    return {
      shortChosen: Reactive.map(chosen, (now) => pressed(now, "short")),
      appChosen: Reactive.map(chosen, (now) => pressed(now, "app")),
      prompt: Reactive.map(chosen, (now) => prompts[now]),
      said,
      onShort: choose("short"),
      onApp: choose("app"),
      onCopy: Effect.map(
        Effect.flatMap(chosen.get, (now) => copied(prompts[now])),
        (result) => UiState.set(said, result),
      ),
    }
  }),
)(AskView)
