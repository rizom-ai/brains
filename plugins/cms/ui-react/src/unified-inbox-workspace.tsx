/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import type {
  InboxWorkspaceAction,
  InboxWorkspaceActionResult,
  InboxWorkspaceEntry,
  InboxWorkspaceQuery,
  InboxWorkspaceSnapshot,
} from "./api";
import { formatUpdated } from "./ui-utils";

function entryKey(entry: InboxWorkspaceEntry): string {
  return `${entry.source.sourceId}:${entry.item.id}`;
}

function sourceFilterValue(value: string): string | undefined {
  return value === "all" ? undefined : value;
}

function urgencyFilterValue(value: string): "high" | "normal" | undefined {
  return value === "high" || value === "normal" ? value : undefined;
}

function InboxConfirmationDialog(props: {
  summary: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const trapFocus = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "Escape" && !props.pending) {
        event.preventDefault();
        props.onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [props],
  );

  return (
    <div className="inbox-dialog-backdrop">
      <div
        ref={dialogRef}
        className="inbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-confirmation-title"
        aria-describedby="inbox-confirmation-summary"
        onKeyDown={trapFocus}
      >
        <span>Confirmation required</span>
        <h3 id="inbox-confirmation-title">Run this inbox action?</h3>
        <p id="inbox-confirmation-summary">{props.summary}</p>
        <div>
          <button
            ref={cancelRef}
            type="button"
            className="btn ghost"
            disabled={props.pending}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? "Working…" : "Confirm action"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnifiedInboxWorkspace(props: {
  data: InboxWorkspaceSnapshot;
  query: InboxWorkspaceQuery;
  onFiltersChange: (filters: {
    sourceId?: string;
    urgency?: "high" | "normal";
  }) => void;
  onLoadMore: () => void;
  onOpenEntity: (entityType: string, entityId: string) => void;
  onAction: (
    action: InboxWorkspaceAction,
  ) => Promise<InboxWorkspaceActionResult>;
}): ReactElement {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: InboxWorkspaceAction;
    summary: string;
    trigger: HTMLButtonElement;
  } | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);
  const pendingRef = useRef(false);
  const selected = props.data.entries.find(
    (entry) => entryKey(entry) === selectedKey,
  );

  useEffect(() => {
    if (selected) detailHeadingRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    if (selectedKey && !selected) setSelectedKey(null);
  }, [selected, selectedKey]);

  const selectEntry = useCallback(
    (entry: InboxWorkspaceEntry, trigger: HTMLButtonElement): void => {
      originRef.current = trigger;
      setSelectedKey(entryKey(entry));
      setFeedback("");
    },
    [],
  );

  const backToList = useCallback((): void => {
    setSelectedKey(null);
    window.setTimeout(() => originRef.current?.focus(), 0);
  }, []);

  const changeFilters = useCallback(
    (filters: { sourceId?: string; urgency?: "high" | "normal" }): void => {
      setSelectedKey(null);
      originRef.current = null;
      setFeedback("");
      props.onFiltersChange(filters);
    },
    [props],
  );

  const execute = useCallback(
    async (
      action: InboxWorkspaceAction,
      trigger: HTMLButtonElement,
    ): Promise<void> => {
      const key = `${action.sourceId}:${action.itemId}:${action.actionId}`;
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPendingKey(key);
      setFeedback("");
      setFeedbackError(false);
      try {
        const result = await props.onAction(action);
        if (result.kind === "confirmation") {
          setConfirmation({ action, summary: result.summary, trigger });
        } else if (result.kind === "error") {
          setFeedback(result.error);
          setFeedbackError(true);
        } else {
          setFeedback("Inbox updated.");
          setSelectedKey(null);
        }
      } catch {
        setFeedback("Inbox action failed");
        setFeedbackError(true);
      } finally {
        pendingRef.current = false;
        setPendingKey(null);
      }
    },
    [props],
  );

  const closeConfirmation = useCallback((): void => {
    const trigger = confirmation?.trigger;
    setConfirmation(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }, [confirmation]);

  const confirmAction = useCallback((): void => {
    if (!confirmation || pendingRef.current) return;
    const { action, trigger } = confirmation;
    setConfirmation(null);
    trigger.focus();
    void execute({ ...action, confirmed: true }, trigger);
  }, [confirmation, execute]);

  const hasMore = props.data.entries.length < props.data.total;

  return (
    <main
      className={
        selected
          ? "unified-inbox-workspace has-selection"
          : "unified-inbox-workspace"
      }
    >
      <header className="inbox-workspace-head">
        <div>
          <span>Live source-owned attention</span>
          <h2>Inbox</h2>
          <p>
            Triage incoming work without creating a second copy of source state.
          </p>
        </div>
        <div className="inbox-workspace-totals" aria-label="Inbox totals">
          <strong>
            {props.data.summary.open}
            <small>open</small>
          </strong>
          <strong className={props.data.summary.high > 0 ? "needs" : ""}>
            {props.data.summary.high}
            <small>high priority</small>
          </strong>
        </div>
      </header>

      <section className="inbox-source-health" aria-label="Source availability">
        {props.data.sources.map((source) => (
          <span
            key={source.source.sourceId}
            className={source.available ? "" : "is-unavailable"}
          >
            <i aria-hidden="true" />
            {source.source.displayName}
            <b>{source.available ? source.open : "unavailable"}</b>
          </span>
        ))}
      </section>

      <section className="inbox-filters" aria-label="Inbox filters">
        <label>
          <span>Source</span>
          <select
            value={props.query.sourceId ?? "all"}
            onChange={(event) => {
              const sourceId = sourceFilterValue(event.target.value);
              changeFilters({
                ...(sourceId ? { sourceId } : {}),
                ...(props.query.urgency
                  ? { urgency: props.query.urgency }
                  : {}),
              });
            }}
          >
            <option value="all">All sources</option>
            {props.data.sources.map((source) => (
              <option
                key={source.source.sourceId}
                value={source.source.sourceId}
              >
                {source.source.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Urgency</span>
          <select
            value={props.query.urgency ?? "all"}
            onChange={(event) => {
              const urgency = urgencyFilterValue(event.target.value);
              changeFilters({
                ...(props.query.sourceId
                  ? { sourceId: props.query.sourceId }
                  : {}),
                ...(urgency ? { urgency } : {}),
              });
            }}
          >
            <option value="all">All urgency</option>
            <option value="high">High priority</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <span>
          {props.data.entries.length} shown · {props.data.total} matching
        </span>
      </section>

      {props.data.errors.length > 0 && (
        <aside className="inbox-source-errors" role="status">
          {props.data.errors.map((error) => (
            <span key={error.source.sourceId}>
              {error.source.displayName} is temporarily unavailable.
            </span>
          ))}
        </aside>
      )}

      <p
        className={
          feedbackError
            ? "status status-error inbox-feedback"
            : "status inbox-feedback"
        }
        aria-live="polite"
      >
        {feedback}
      </p>

      <div className="inbox-workspace-grid">
        <section className="inbox-list-pane" aria-label="Inbox items">
          {props.data.entries.length === 0 ? (
            <p className="inbox-empty">
              Nothing needs attention for these filters.
            </p>
          ) : (
            <ol>
              {props.data.entries.map((entry) => {
                const key = entryKey(entry);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={
                        key === selectedKey
                          ? "inbox-row is-selected"
                          : "inbox-row"
                      }
                      aria-current={key === selectedKey ? "true" : undefined}
                      onClick={(event) =>
                        selectEntry(entry, event.currentTarget)
                      }
                    >
                      <span className={`inbox-urgency ${entry.item.urgency}`}>
                        {entry.item.urgency}
                      </span>
                      <strong>{entry.item.title}</strong>
                      <small>
                        {entry.source.displayName} ·{" "}
                        {formatUpdated(entry.item.receivedAt)}
                      </small>
                      <i aria-hidden="true">→</i>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {hasMore && (
            <button
              type="button"
              className="btn ghost inbox-load-more"
              onClick={props.onLoadMore}
            >
              Load more
            </button>
          )}
        </section>

        <section className="inbox-detail-pane" aria-label="Inbox item detail">
          {selected ? (
            <>
              <button
                type="button"
                className="inbox-detail-back"
                onClick={backToList}
              >
                ← Back to inbox
              </button>
              <header>
                <span className={`inbox-urgency ${selected.item.urgency}`}>
                  {selected.item.urgency} priority
                </span>
                <time dateTime={selected.item.receivedAt}>
                  {formatUpdated(selected.item.receivedAt)}
                </time>
                <h3 ref={detailHeadingRef} tabIndex={-1}>
                  {selected.item.title}
                </h3>
                <small>{selected.source.displayName}</small>
              </header>
              {selected.item.summary ? (
                <p className="inbox-detail-summary">{selected.item.summary}</p>
              ) : (
                <p className="inbox-detail-summary is-muted">
                  This source supplied no additional summary.
                </p>
              )}
              {selected.item.entityRef && (
                <button
                  type="button"
                  className="inbox-entity-link"
                  onClick={() =>
                    props.onOpenEntity(
                      selected.item.entityRef?.entityType ?? "",
                      selected.item.entityRef?.entityId ?? "",
                    )
                  }
                >
                  Open source entity →
                </button>
              )}
              <footer>
                <span>Available actions</span>
                <nav aria-label={`Actions for ${selected.item.title}`}>
                  {selected.item.actions.map((action) => {
                    const key = `${selected.source.sourceId}:${selected.item.id}:${action.id}`;
                    return (
                      <button
                        type="button"
                        className={
                          action.confirm ? "requires-confirmation" : ""
                        }
                        disabled={pendingKey !== null}
                        key={action.id}
                        onClick={(event) =>
                          void execute(
                            {
                              sourceId: selected.source.sourceId,
                              itemId: selected.item.id,
                              actionId: action.id,
                            },
                            event.currentTarget,
                          )
                        }
                      >
                        {pendingKey === key ? "Working…" : action.label}
                      </button>
                    );
                  })}
                  {selected.item.actions.length === 0 && (
                    <small>No actions are currently offered.</small>
                  )}
                </nav>
              </footer>
            </>
          ) : (
            <div className="inbox-detail-empty">
              <span aria-hidden="true">↳</span>
              <p>Select an item to inspect its content-safe detail.</p>
            </div>
          )}
        </section>
      </div>

      {confirmation && (
        <InboxConfirmationDialog
          summary={confirmation.summary}
          pending={pendingKey !== null}
          onCancel={closeConfirmation}
          onConfirm={confirmAction}
        />
      )}
    </main>
  );
}
