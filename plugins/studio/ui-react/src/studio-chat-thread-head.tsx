/** @jsxImportSource react */
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@brains/app-ui-react";
import type { ChatCard } from "@brains/contracts/chat";
import { useRef, type ReactElement } from "react";
import type { StudioChatStreamState } from "./chat-workspace-model";
import { ConversationContext } from "./studio-chat-context-panel";
import { CHAT_UPLOAD_GUIDANCE } from "./studio-chat-contracts";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { SessionRail } from "./studio-chat-rail";
import { StudioChatSessionRename } from "./studio-chat-session-rename";
import type { ChatSessions } from "./use-chat-sessions";

/**
 * The conversation's title and toolbar, with the two dialogs they open: the
 * session history and the details of the open conversation.
 */
export function StudioChatThreadHead(props: {
  sessionId: string | null;
  sessions: ChatSessions;
  archiving: boolean;
  /** Archiving waits while anything is sending, uploading or drafted. */
  archiveBlocked: boolean;
  /** The composer holds text or uploads the archive would strand. */
  draftPending: boolean;
  onArchive: () => void;
  contextCards: ChatCard[];
  progress: StudioChatStreamState["progress"];
}): ReactElement {
  const {
    currentSession,
    archivedSession,
    sessions,
    sessionControls,
    sessionsLoading,
    navigateToSession,
    sessionPickerOpen,
    setSessionPickerOpen,
    detailsOpen,
    setDetailsOpen,
    renameCurrent,
  } = props.sessions;
  const detailsTrigger = useRef<HTMLSpanElement>(null);
  const sessionPickerTrigger = useRef<HTMLSpanElement>(null);

  return (
    <>
      <header
        className={chatClass("studio-chat-thread-head", chatLayout.threadHead)}
      >
        <h1
          className={chatClass("studio-chat-session-heading", chatLayout.title)}
          title={currentSession?.title}
        >
          {currentSession?.title ??
            (props.sessionId ? "Conversation" : "New conversation")}
        </h1>
        <div
          className={chatClass("studio-chat-head-actions", chatLayout.toolbar)}
        >
          <span
            ref={sessionPickerTrigger}
            className="studio-chat-session-picker-trigger"
          >
            <Button
              type="button"
              variant="ghost"
              xstyle={chatLayout.toolbarButton}
              aria-haspopup="dialog"
              aria-expanded={sessionPickerOpen}
              onClick={() => setSessionPickerOpen(true)}
            >
              History
            </Button>
          </span>
          <Button
            type="button"
            variant="ghost"
            xstyle={chatLayout.toolbarButton}
            aria-label="New conversation"
            title="New conversation"
            onClick={() => navigateToSession()}
          >
            +
          </Button>
          <span ref={detailsTrigger}>
            <Button
              type="button"
              variant="ghost"
              xstyle={chatLayout.toolbarButton}
              aria-label="Conversation details and options"
              aria-haspopup="dialog"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen(true)}
            >
              •••
            </Button>
          </span>
        </div>
      </header>
      <Dialog open={sessionPickerOpen} onOpenChange={setSessionPickerOpen}>
        <DialogContent
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            sessionPickerTrigger.current?.querySelector("button")?.focus();
          }}
        >
          <DialogTitle>Conversations</DialogTitle>
          <SessionRail
            {...sessionControls}
            activeSessionId={props.sessionId}
            loading={sessionsLoading}
            sessions={sessions}
            onNew={() => navigateToSession()}
            onSelect={navigateToSession}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailsTrigger.current?.querySelector("button")?.focus();
          }}
        >
          <DialogTitle>Conversation details</DialogTitle>
          <div className={chatClass("studio-chat-details", chatLayout.details)}>
            <p>{currentSession?.title ?? "New conversation"}</p>
            <div
              className={chatClass(
                "studio-chat-session-actions",
                chatLayout.actions,
              )}
            >
              {currentSession && (
                <StudioChatSessionRename
                  key={currentSession.id}
                  title={currentSession.title}
                  onRename={renameCurrent}
                />
              )}
              {archivedSession && (
                <p role="status">
                  Archived conversation. New messages here remain archived.
                </p>
              )}
              {props.sessionId && !archivedSession ? (
                <Button
                  className="studio-chat-header-action"
                  variant="ghost"
                  type="button"
                  onClick={props.onArchive}
                  disabled={props.archiveBlocked}
                  title={
                    props.draftPending
                      ? "Send or clear the draft before archiving"
                      : undefined
                  }
                >
                  {props.archiving ? "Archiving…" : "Archive"}
                </Button>
              ) : null}
            </div>
            <details>
              <summary>Sources and attachments</summary>
              <ConversationContext
                cards={props.contextCards}
                progress={props.progress}
                session={currentSession}
              />
            </details>
            <details>
              <summary>File types and limits</summary>
              <p id="studio-chat-upload-guidance">{CHAT_UPLOAD_GUIDANCE}</p>
            </details>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
