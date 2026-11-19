import { Schema } from "effect"
import { Props, UiState, View } from "spar"

export const BadgeView = View.make(
  "Badge",
  { text: Schema.String, tone: Schema.optional(Schema.Literals(["calm", "loud"])) },
  ({ text, tone }) => <span data-tone={tone ?? "calm"}>{text}</span>,
)

export const CardView = View.make(
  "Card",
  {
    title: Props.Reactive(Schema.String),
    draft: Props.State(Schema.String),
    count: Schema.Int,
    body: Props.Element,
    field: Props.Handle,
    onSave: Props.Action,
    onPick: Props.Callback(Schema.String),
  },
  ({ title, draft, count, body, field, onSave, onPick }) => (
    <article>
      <h2>{title}</h2>
      <BadgeView text={`${count} notes`} />
      <input
        aria-label="Draft"
        ref={field}
        value={draft}
        onInput={(event) => UiState.set(draft, event.currentTarget.value)}
      />
      {body}
      <button onClick={onSave}>Save</button>
      <button onClick={onPick("first")}>Pick first</button>
    </article>
  ),
)
