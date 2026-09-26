/** @jsxImportSource react */
import type { RefObject, ReactElement } from "react";
import type {
  ChatHistoryMessage,
  ChatMessageRequest,
  GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { GuestMarkdown, GuestTranscript } from "./GuestTranscript";

export interface GuestPageProps {
  name: string;
  siteLabel: string;
  session: GuestChatSessionResponse | undefined;
  messages: ChatHistoryMessage[];
  status: string;
  draft: string;
  /** Locators saved in this tab, offered for reopening. */
  conversations: string[];
  id: string | undefined;
  busy: boolean;
  /** A submission awaiting confirmation; its presence blocks a new question. */
  pending: ChatMessageRequest | undefined;
  deleting: boolean;
  expired: boolean;
  transcriptRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  conversationMenuRef: RefObject<HTMLDetailsElement | null>;
  /** Whether the transcript should stay pinned to the newest message. */
  followTranscript: RefObject<boolean>;
  onRestore: (locator: string) => void;
  onNewConversation: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onReloadHistory: () => void;
  onDraftChange: (text: string) => void;
  onTopic: (topic: string) => void;
  onSubmit: () => void;
  onStopWaiting: () => void;
  onRetry: () => void;
}

/**
 * The standalone Ask page: conversation controls, transcript, status line and
 * composer. The boxed embed renders `GuestBox` instead; both are chosen by
 * `GuestApp`.
 */
export function GuestPage(props: GuestPageProps): ReactElement {
  const {
    session,
    messages,
    draft,
    busy,
    pending,
    expired,
    id,
    followTranscript,
  } = props;

  return (
    <div className="guest-ask">
      <section aria-label="Public Ask">
        <div className="guest-introduction">
          <div>
            <p className="guest-eyebrow">Public knowledge · Your questions</p>
            <h1>Ask {props.name}.</h1>
          </div>
        </div>
        <section className="guest-card" aria-label="Public conversation">
          <header className="guest-card-header">
            <span className="guest-brain-name">{props.siteLabel}</span>
            <span className="guest-scope">Public knowledge</span>
            {session && (
              <details
                className="guest-conversation-menu"
                ref={props.conversationMenuRef}
              >
                <summary aria-label="Conversation actions">···</summary>
                <nav className="guest-tools" aria-label="Conversation controls">
                  <label>
                    Conversations in this tab{" "}
                    <select
                      aria-label="Previous conversation"
                      value={id ?? ""}
                      disabled={busy}
                      onChange={(event): void =>
                        props.onRestore(event.target.value)
                      }
                    >
                      <option value="">Choose conversation</option>
                      {props.conversations.map((locator, index) => (
                        <option key={locator} value={locator}>
                          Conversation {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy} onClick={props.onNewConversation}>
                    New conversation
                  </button>
                  <button disabled={!id || busy} onClick={props.onAskDelete}>
                    Delete conversation
                  </button>
                  <button
                    disabled={!id || busy}
                    onClick={props.onReloadHistory}
                  >
                    Reload history
                  </button>
                </nav>
              </details>
            )}
          </header>
          <div
            className="guest-transcript-scroll"
            ref={props.transcriptRef}
            role="region"
            aria-label="Conversation transcript"
            tabIndex={0}
            onScroll={(event): void => {
              const view = event.currentTarget;
              followTranscript.current =
                view.scrollHeight - view.scrollTop - view.clientHeight < 64;
            }}
          >
            {props.deleting && (
              <div className="guest-delete" role="alert">
                <p>
                  Delete this conversation from the Brain? This does not erase
                  provider records or cancel remote work.
                </p>
                <button disabled={busy} onClick={props.onConfirmDelete}>
                  Confirm deletion
                </button>
                <button disabled={busy} onClick={props.onCancelDelete}>
                  Keep conversation
                </button>
              </div>
            )}
            {!messages.length &&
              session?.canSend &&
              !pending &&
              !!(
                session.presentation?.title ??
                session.presentation?.introduction ??
                session.presentation?.topics?.length
              ) && (
                <div className="guest-empty">
                  {session.presentation.title && (
                    <h2>{session.presentation.title}</h2>
                  )}
                  {session.presentation.introduction && (
                    <GuestMarkdown>
                      {session.presentation.introduction}
                    </GuestMarkdown>
                  )}
                  <div className="guest-topics">
                    {(session.presentation.topics ?? []).map((topic, index) => (
                      <button
                        className="guest-topic"
                        type="button"
                        key={topic}
                        onClick={(): void => props.onTopic(topic)}
                      >
                        <span aria-hidden="true">0{index + 1}</span>
                        {topic}
                        <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            {!messages.length && !session?.canSend && !busy && !pending && (
              <div className="guest-empty guest-unavailable">
                <p className="guest-eyebrow">Public knowledge</p>
                <h2>Asking is unavailable right now.</h2>
                <p>
                  No new question has been sent. This page does not renew an
                  expired or exhausted allowance.
                </p>
              </div>
            )}
            <GuestTranscript messages={messages} />
          </div>
          <p className="guest-status" role="status" aria-live="polite">
            {props.status}
          </p>
          {session?.canSend && (
            <form
              className="guest-composer"
              onSubmit={(event): void => {
                event.preventDefault();
                props.onSubmit();
              }}
            >
              <label className="guest-sr" htmlFor="guest-question">
                Your question
              </label>
              <textarea
                ref={props.textareaRef}
                id="guest-question"
                aria-describedby="guest-recording-note"
                value={draft}
                onInput={(event): void =>
                  props.onDraftChange(event.currentTarget.value)
                }
                maxLength={session.messageCharacters}
                disabled={busy || !!pending || expired}
                placeholder={
                  messages.length
                    ? "Follow that thought…"
                    : "Start with a question…"
                }
                rows={2}
              />
              <div className="guest-compose-actions">
                <small>
                  {draft.length} / {session.messageCharacters}
                </small>
                {busy ? (
                  <button type="button" onClick={props.onStopWaiting}>
                    Stop waiting
                  </button>
                ) : pending ? (
                  <button
                    type="button"
                    disabled={!pending.id}
                    onClick={props.onRetry}
                  >
                    {pending.id
                      ? "Check / retry same request"
                      : "Recovery unavailable"}
                  </button>
                ) : (
                  <button
                    className="guest-send"
                    type="submit"
                    disabled={!draft.trim() || expired}
                  >
                    <span className="guest-sr">Ask the Brain</span>
                    <span aria-hidden="true">↑</span>
                  </button>
                )}
              </div>
              <p id="guest-recording-note" className="guest-recording">
                {session.recording.notice}
              </p>
            </form>
          )}
        </section>
        <div className="guest-below">
          {session && (
            <details className="guest-disclosure">
              <summary>Privacy and limits</summary>
              <p>{session.notice}</p>
              <p>Provider: {session.provider}</p>
              <p>
                Visitor access expires{" "}
                {new Date(session.expiresAt).toLocaleString()}. Conversation
                retention: idle limit {session.retention.idleSeconds / 3600}{" "}
                hours; maximum age {session.retention.maxAgeSeconds / 3600}{" "}
                hours.
              </p>
              <p>{session.deletionLimitations}</p>
              <p>
                Your messages are not automatically added to the Brain’s
                knowledge. This chat cannot edit, publish or administer the
                Brain.
              </p>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
