import { Events, Reactive, UiState } from "spar"
import type { Action, Element } from "spar"
import type { ThreadLoadFailed } from "./MailApi.ts"
import type { Reply } from "./MailStore.ts"

export const ThreadSkeletonView = ({ id }: { readonly id: string }) => (
  <article aria-label={`Thread ${id}`}>
    <p role="status">Loading thread {id}</p>
  </article>
)

export const ThreadErrorView = ({ error }: { readonly error: ThreadLoadFailed }) => (
  <article aria-label={`Thread ${error.threadId}`}>
    <p role="alert">{error.message}</p>
  </article>
)

type MenuProps = {
  readonly onArchive: Action
  readonly onMarkUnread: Action
}

export const ThreadMenuView = ({ onArchive, onMarkUnread }: MenuProps) => (
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
)

export const ReplyView = ({ reply }: { readonly reply: Reactive.Reactive<Reply> }) => (
  <li>{Reactive.map(reply, (item) => item.text)}</li>
)

type Props = {
  readonly subject: string
  readonly messages: ReadonlyArray<string>
  readonly status: Reactive.Reactive<string>
  readonly menuOpen: UiState.UiState<boolean>
  readonly menu: Element
  readonly draft: UiState.UiState<string>
  readonly replies: Element
  readonly unsent: Reactive.Reactive<number>
  readonly onSend: Action
}

export const ThreadView = (props: Props) => (
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
)

type MailProps = {
  readonly welcome: Element
  readonly missing: Element
}

export const MailView = ({ welcome, missing }: MailProps) => (
  <section aria-label="Mail">
    <h2>Mail threads</h2>
    {welcome}
    {missing}
  </section>
)
