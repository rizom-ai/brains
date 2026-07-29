/** @jsxImportSource react */
import type { WebChatSession } from "../api";
import { sessionTitleMaxLength } from "../session-format";

export type SessionDialogState =
  | { kind: "rename"; session: WebChatSession }
  | { kind: "archive"; session: WebChatSession }
  | { kind: "delete"; session: WebChatSession }
  | null;

export interface SessionDialogProps {
  dialog: NonNullable<SessionDialogState>;
  renameDraft: string;
  renamePending: boolean;
  archivePending: boolean;
  deletePending: boolean;
  onRenameDraftChange: (title: string) => void;
  onClose: () => void;
  onRename: (session: WebChatSession, title: string) => void;
  onArchive: (session: WebChatSession) => void;
  onDelete: (session: WebChatSession) => void;
}

function dialogKicker(kind: NonNullable<SessionDialogState>["kind"]): string {
  if (kind === "rename") return "Retitle trace";
  if (kind === "archive") return "Store trace";
  return "Prune trace";
}

function dialogTitle(kind: NonNullable<SessionDialogState>["kind"]): string {
  if (kind === "rename") return "Rename this thread";
  if (kind === "archive") return "Archive this thread?";
  return "Delete this thread?";
}

export function SessionDialog(props: SessionDialogProps): React.ReactElement {
  const { dialog } = props;

  return (
    <div className="web-chat-session-dialog-backdrop" role="presentation">
      <section
        className="web-chat-session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-chat-session-dialog-title"
      >
        <span className="web-chat-session-dialog-kicker">
          {dialogKicker(dialog.kind)}
        </span>
        <h2 id="web-chat-session-dialog-title">{dialogTitle(dialog.kind)}</h2>
        {dialog.kind === "rename" ? (
          <form
            className="web-chat-session-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              props.onRename(dialog.session, props.renameDraft);
            }}
          >
            <label htmlFor="web-chat-session-rename-input">Trace title</label>
            <input
              id="web-chat-session-rename-input"
              value={props.renameDraft}
              maxLength={sessionTitleMaxLength}
              onInput={(event) =>
                props.onRenameDraftChange(event.currentTarget.value)
              }
            />
            <div className="web-chat-session-dialog-actions">
              <button type="button" onClick={props.onClose}>
                Keep old title
              </button>
              <button
                type="submit"
                data-primary="true"
                disabled={props.renamePending || !props.renameDraft.trim()}
              >
                Rename
              </button>
            </div>
          </form>
        ) : dialog.kind === "archive" ? (
          <>
            <p>
              This stores <strong>{dialog.session.title}</strong> out of the
              active rail without deleting its saved messages.
            </p>
            <div className="web-chat-session-dialog-actions">
              <button type="button" onClick={props.onClose}>
                Keep active
              </button>
              <button
                type="button"
                data-primary="true"
                disabled={props.archivePending}
                onClick={() => props.onArchive(dialog.session)}
              >
                Archive
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              This removes <strong>{dialog.session.title}</strong> and its saved
              messages from the session rail.
            </p>
            <div className="web-chat-session-dialog-actions">
              <button type="button" onClick={props.onClose}>
                Keep trace
              </button>
              <button
                type="button"
                data-danger="true"
                disabled={props.deletePending}
                onClick={() => props.onDelete(dialog.session)}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
