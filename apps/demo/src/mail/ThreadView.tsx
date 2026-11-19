import { Schema } from "effect"
import { Events, Props, Reactive, UiState, View } from "spar"
import { ThreadLoadFailed } from "../server/MailApi.ts"
import { Reply } from "./MailStore.ts"

export const ThreadSkeletonView = View.make(
  "ThreadSkeletonView",
  { id: Schema.String },
  ({ id }) => (
    <article aria-label={`Thread ${id}`}>
      <p role="status">Loading thread {id}</p>
    </article>
  ),
)

export const ThreadErrorView = View.make(
  "ThreadErrorView",
  { error: ThreadLoadFailed },
  ({ error }) => (
    <article aria-label={`Thread ${error.threadId}`}>
      <p role="alert">{error.message}</p>
    </article>
  ),
)

export const ThreadMenuView = View.make(
  "ThreadMenuView",
  { onArchive: Props.Action, onMarkUnread: Props.Action },
  ({ onArchive, onMarkUnread }) => (
    <ul role="menu" aria-label="Thread actions">
      <li role="none">
        <button role="menuitem" onClick={onArchive}>
          Archive
        </button>
      </li>
      <li role="none">
        <button role="menuitem" onClick={onMarkUnread}>
          Mark unread
        </button>
      </li>
    </ul>
  ),
)

export const ReplyView = View.make("ReplyView", { reply: Props.Reactive(Reply) }, ({ reply }) => (
  <li>{Reactive.map(reply, (item) => item.text)}</li>
))

export const ThreadView = View.make(
  "ThreadView",
  {
    subject: Schema.String,
    messages: Schema.Array(Schema.String),
    status: Props.Reactive(Schema.String),
    menuOpen: Props.State(Schema.Boolean),
    menu: Props.Element,
    draft: Props.State(Schema.String),
    replies: Props.Element,
    unsent: Props.Reactive(Schema.Finite),
    onSend: Props.Action,
  },
  (props) => (
    <article aria-label={props.subject}>
      <h3>{props.subject}</h3>
      <p>
        Status: <output aria-label="Thread status">{props.status}</output>
      </p>
      <span onPointerdown={Events.stop([])}>
        <button
          aria-expanded={props.menuOpen}
          onClick={UiState.update(props.menuOpen, (open) => !open)}
        >
          Actions
        </button>
        {props.menu}
      </span>
      <p>{props.messages.join(" ")}</p>
      <ul aria-label="Replies">{props.replies}</ul>
      <input
        aria-label="Reply"
        placeholder="Write a reply"
        value={props.draft}
        onInput={(event) => UiState.set(props.draft, event.currentTarget.value)}
      />
      <button onClick={props.onSend}>Send reply</button>
      <p>
        Waiting to send: <output aria-label="Unsent replies">{props.unsent}</output>
      </p>
    </article>
  ),
)

export const MailView = View.make(
  "MailView",
  { welcome: Props.Element, missing: Props.Element },
  ({ welcome, missing }) => (
    <section aria-label="Mail">
      <h2>Mail threads</h2>
      {welcome}
      {missing}
    </section>
  ),
)
