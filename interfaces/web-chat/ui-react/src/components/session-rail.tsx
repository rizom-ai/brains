/** @jsxImportSource react */
import type { WebChatSession } from "../api";
import { formatSessionTime } from "../session-format";

export interface SessionRailProps {
  sessions: WebChatSession[];
  isLoading: boolean;
  sessionError: string | null;
  activeConversationId: string;
  loadingConversationId: string | null;
  deletingConversationId: string | null;
  archivingConversationId: string | null;
  renamingConversationId: string | null;
  chatIsBusy: boolean;
  onRetry: () => void;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onRename: (session: WebChatSession) => void;
  onArchive: (session: WebChatSession) => void;
  onDelete: (session: WebChatSession) => void;
}

function SessionSkeleton(): React.ReactElement {
  return (
    <ul
      className="web-chat-sessions-list"
      aria-busy="true"
      aria-label="Loading sessions"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className="web-chat-session-skeleton">
          <span />
          <div>
            <span />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SessionRow({
  session,
  props,
}: {
  session: WebChatSession;
  props: SessionRailProps;
}): React.ReactElement {
  const isLoading = session.id === props.loadingConversationId;
  const isDeleting = session.id === props.deletingConversationId;
  const isArchiving = session.id === props.archivingConversationId;
  const isRenaming = session.id === props.renamingConversationId;
  const busy = isLoading || isDeleting || isArchiving || isRenaming;
  // Any pending session mutation locks the whole rail: the rows share one
  // cache, so letting a second action start would race the first one's write.
  const actionsDisabled =
    props.chatIsBusy ||
    props.loadingConversationId !== null ||
    props.deletingConversationId !== null ||
    props.archivingConversationId !== null ||
    props.renamingConversationId !== null;
  const isActive = session.id === props.activeConversationId;

  return (
    <li className="web-chat-session-item">
      <button
        className="web-chat-session"
        type="button"
        role="option"
        aria-selected={isActive}
        aria-busy={busy}
        disabled={actionsDisabled}
        data-active={isActive ? "true" : "false"}
        data-loading={isLoading ? "true" : "false"}
        onClick={() => props.onSelect(session.id)}
      >
        <span className="web-chat-session-time">
          {formatSessionTime(session.lastActiveAt)}
        </span>
        <div className="web-chat-session-body">
          <h3 className="web-chat-session-title">{session.title}</h3>
          {busy ? (
            <span className="web-chat-session-subtitle">
              {isRenaming
                ? "renaming…"
                : isArchiving
                  ? "archiving…"
                  : isDeleting
                    ? "deleting…"
                    : "reopening…"}
            </span>
          ) : null}
        </div>
      </button>
      <button
        className="web-chat-session-rename"
        type="button"
        aria-label={`Rename ${session.title}`}
        disabled={actionsDisabled}
        onClick={() => props.onRename(session)}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M9.8 3.2 12.8 6.2" strokeLinecap="round" />
          <path
            d="M3.5 12.5 4.2 9.4 10.9 2.7a1.4 1.4 0 0 1 2 2L6.2 11.4l-2.7 1.1Z"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        className="web-chat-session-archive"
        type="button"
        aria-label={`Archive ${session.title}`}
        disabled={actionsDisabled}
        onClick={() => props.onArchive(session)}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3 5.2h10M4 5.2v7h8v-7" strokeLinejoin="round" />
          <path d="M6.5 8h3" strokeLinecap="round" />
          <path d="M4.2 3.2h7.6L13 5.2H3l1.2-2Z" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className="web-chat-session-delete"
        type="button"
        aria-label={`Delete ${session.title}`}
        disabled={actionsDisabled}
        onClick={() => props.onDelete(session)}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3.5 4.5h9" strokeLinecap="round" />
          <path d="M6 4.5V3.2h4v1.3" strokeLinejoin="round" />
          <path
            d="M5 6.5v5.2M8 6.5v5.2M11 6.5v5.2M4.7 4.5l.45 8.3h5.7l.45-8.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </li>
  );
}

function SessionList(props: SessionRailProps): React.ReactNode {
  const { sessions, sessionError } = props;

  if (props.isLoading && sessions.length === 0) {
    return <SessionSkeleton />;
  }

  if (sessionError && sessions.length === 0) {
    return (
      <div className="web-chat-sessions-state" data-tone="error" role="alert">
        <span className="web-chat-sessions-state-tag">Signal lost</span>
        <p>{sessionError}</p>
        <button type="button" onClick={props.onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="web-chat-sessions-state" aria-live="polite">
        <span className="web-chat-sessions-state-tag">No traces yet</span>
        <p>Your first thread will root here after you plant a question.</p>
      </div>
    );
  }

  return (
    <>
      {sessionError ? (
        <div className="web-chat-sessions-inline-error" role="status">
          <span>Sync paused</span>
          <button type="button" onClick={props.onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      <ul className="web-chat-sessions-list" role="listbox">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} props={props} />
        ))}
      </ul>
    </>
  );
}

export function SessionRail(props: SessionRailProps): React.ReactElement {
  return (
    <aside className="web-chat-sessions" aria-label="Sessions">
      <header className="web-chat-sessions-header">
        <h2>Conversations</h2>
        <button
          className="web-chat-sessions-new"
          type="button"
          aria-label="New conversation"
          onClick={props.onNewConversation}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M8 3v10M3 8h10" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <SessionList {...props} />

      <footer className="web-chat-sessions-footer">
        <span className="web-chat-sessions-footer-id">brain · anchor</span>
      </footer>
    </aside>
  );
}
