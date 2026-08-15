/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type {
  EmailReplyDraftAction,
  EmailReplyDraftActionResult,
  EmailReplyDraftSourceRequest,
  EmailReplyDraftSourceResult,
  EmailReplyDraftWorkspaceSnapshot,
} from "./api";
import { formatUpdated } from "./ui-utils";

interface DraftFeedback {
  message: string;
  error: boolean;
}

type DraftSource = Extract<
  EmailReplyDraftSourceResult,
  { kind: "source" }
>["source"];

type DraftSourceState =
  | { status: "loading" }
  | { status: "available"; source: DraftSource }
  | { status: "unavailable" };

export function EmailReplyDraftWorkspace(props: {
  data: EmailReplyDraftWorkspaceSnapshot;
  onAction: (
    action: EmailReplyDraftAction,
  ) => Promise<EmailReplyDraftActionResult>;
  onSource: (
    request: EmailReplyDraftSourceRequest,
    signal: AbortSignal,
  ) => Promise<EmailReplyDraftSourceResult>;
}): ReactElement {
  const { data, onAction, onSource } = props;
  const [text, setText] = useState(data.draft?.text ?? "");
  const [revision, setRevision] = useState(data.draft?.revision ?? 0);
  const [savedText, setSavedText] = useState(data.draft?.text ?? "");
  const [pending, setPending] = useState<"generate" | "save" | null>(null);
  const [feedback, setFeedback] = useState<DraftFeedback | null>(null);
  const [sourceState, setSourceState] = useState<DraftSourceState | null>(null);
  const sourceAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const nextText = data.draft?.text ?? "";
    setText(nextText);
    setSavedText(nextText);
    setRevision(data.draft?.revision ?? 0);
    setFeedback(null);
  }, [data]);

  const loadSource = useCallback(
    (mailItemId: string): void => {
      sourceAbortRef.current?.abort();
      const controller = new AbortController();
      sourceAbortRef.current = controller;
      setSourceState({ status: "loading" });
      void onSource({ type: "source", mailItemId }, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setSourceState(
            result.kind === "source"
              ? { status: "available", source: result.source }
              : { status: "unavailable" },
          );
        },
        () => {
          if (!controller.signal.aborted) {
            setSourceState({ status: "unavailable" });
          }
        },
      );
    },
    [onSource],
  );

  useEffect(() => {
    if (!data.mailItemId) {
      sourceAbortRef.current?.abort();
      sourceAbortRef.current = null;
      setSourceState(null);
      return undefined;
    }
    loadSource(data.mailItemId);
    return (): void => sourceAbortRef.current?.abort();
  }, [data.mailItemId, loadSource]);

  const run = useCallback(
    async (action: EmailReplyDraftAction): Promise<void> => {
      setPending(action.type);
      setFeedback(null);
      try {
        const result = await onAction(action);
        if (result.kind === "error") {
          setFeedback({ message: result.error, error: true });
          return;
        }
        setText(result.draft.text);
        setSavedText(result.draft.text);
        setRevision(result.draft.revision);
        setFeedback({
          message:
            action.type === "generate"
              ? "Reply draft generated."
              : "Draft saved.",
          error: false,
        });
      } catch {
        setFeedback({ message: "Reply draft operation failed", error: true });
      } finally {
        setPending(null);
      }
    },
    [onAction],
  );

  const mailItemId = data.mailItemId;
  if (!mailItemId) {
    return (
      <main className="email-reply-draft-workspace is-empty">
        <header>
          <span>Email workflow</span>
          <h2>Reply drafts</h2>
          <p>Open an email in Inbox and choose Draft reply to begin.</p>
        </header>
      </main>
    );
  }

  const source =
    sourceState?.status === "available" ? sourceState.source : undefined;
  const recipient = source?.replyTo ?? source?.from;
  const dirty = text !== savedText;

  return (
    <main className="email-reply-draft-workspace">
      <header className="reply-draft-head">
        <div>
          <span>Email workflow · operator approval required</span>
          <h2>Draft reply</h2>
          <p>
            Generate and edit a reply without copying the original message into
            Brain. Nothing is sent from this workspace.
          </p>
        </div>
        {data.draft && (
          <small>
            revision {revision} · updated {formatUpdated(data.draft.updatedAt)}
          </small>
        )}
      </header>

      <div className="reply-draft-grid">
        <section className="reply-source" aria-label="Original email">
          <header>
            <span>Original email</span>
            <small>Read on demand · not persisted</small>
          </header>
          {sourceState?.status === "loading" ? (
            <p className="reply-source-unavailable" role="status">
              Loading original content…
            </p>
          ) : source ? (
            <>
              <dl>
                <div>
                  <dt>Reply to</dt>
                  <dd>
                    {recipient?.name ? `${recipient.name} · ` : ""}
                    {recipient?.address}
                  </dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{source.subject || "(no subject)"}</dd>
                </div>
              </dl>
              <pre tabIndex={0}>
                {source.text || "This message has no plain-text content."}
              </pre>
              {source.truncated && (
                <small>Only the first part of this message is shown.</small>
              )}
            </>
          ) : (
            <div className="reply-source-unavailable" role="status">
              <p>
                Original content is unavailable. An existing draft remains
                editable.
              </p>
              <button type="button" onClick={() => loadSource(mailItemId)}>
                Retry
              </button>
            </div>
          )}
        </section>

        <section className="reply-composer" aria-label="Reply draft editor">
          <header>
            <span>Reply</span>
            <small>{text.length.toLocaleString()} / 20,000 characters</small>
          </header>
          <textarea
            aria-label="Reply text"
            maxLength={20_000}
            placeholder="Generate a draft or write your reply…"
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
          />
          <footer>
            <button
              type="button"
              className="btn ghost"
              disabled={!source || pending !== null}
              onClick={() =>
                void run({
                  type: "generate",
                  mailItemId,
                })
              }
            >
              {pending === "generate"
                ? "Generating…"
                : revision > 0
                  ? "Generate new revision"
                  : "Generate draft"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!dirty || text.trim() === "" || pending !== null}
              onClick={() =>
                void run({
                  type: "save",
                  mailItemId,
                  text,
                  baseRevision: revision,
                })
              }
            >
              {pending === "save" ? "Saving…" : "Save draft"}
            </button>
          </footer>
          <p
            className={feedback?.error ? "status status-error" : "status"}
            aria-live="polite"
          >
            {feedback?.message ?? ""}
          </p>
        </section>
      </div>
    </main>
  );
}
