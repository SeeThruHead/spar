import { Schema } from "effect"
import { Props, View } from "spar"

export const AskView = View.make(
  "AskView",
  {
    shortChosen: Props.Reactive(Schema.String),
    appChosen: Props.Reactive(Schema.String),
    prompt: Props.Reactive(Schema.String),
    said: Props.Reactive(Schema.String),
    onShort: Props.Action,
    onApp: Props.Action,
    onCopy: Props.Action,
  },
  (props) => (
    <section class="ask" aria-labelledby="ask-title">
      <h2 id="ask-title">Explore with an AI agent</h2>
      <p>Copy a prompt and paste it into any agent that can read a web page.</p>
      <div class="ask-box">
        <p class="ask-tabs">
          <button
            type="button"
            class="ask-tab"
            aria-pressed={props.shortChosen}
            onClick={props.onShort}
          >
            In short
          </button>
          <button
            type="button"
            class="ask-tab"
            aria-pressed={props.appChosen}
            onClick={props.onApp}
          >
            Your React app
          </button>
          <button type="button" class="spar-button ask-copy" onClick={props.onCopy}>
            Copy
          </button>
        </p>
        <pre class="ask-prompt">{props.prompt}</pre>
        <p class="ask-said" role="status">
          {props.said}
        </p>
      </div>
    </section>
  ),
)
