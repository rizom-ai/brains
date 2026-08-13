/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type {
  InboxWorkspaceAction,
  InboxWorkspaceActionResult,
  InboxWorkspaceEntry,
  InboxWorkspaceFollowUp,
  InboxWorkspaceSnapshot,
} from "./api";
import { ConfirmDialog } from "./confirm-dialog";
import type { CmsWorkspaceQuery } from "./queries";
import { formatUpdated, useWorkspaceAction } from "./ui-utils";
import { workspaceUrlSearch } from "./workspace-url-query";

function entryKey(entry: InboxWorkspaceEntry): string {
  return `${entry.source.sourceId}:${entry.item.id}`;
}

function actionKey(action: InboxWorkspaceAction): string {
  return `${action.sourceId}:${action.itemId}:${action.actionId}`;
}

function mergeEntries(
  current: InboxWorkspaceEntry[],
  next: InboxWorkspaceEntry[],
): InboxWorkspaceEntry[] {
  const merged = new Map(current.map((entry) => [entryKey(entry), entry]));
  for (const entry of next) {
    merged.set(entryKey(entry), entry);
  }
  return [...merged.values()];
}

function sourceFilterValue(value: string): string | undefined {
  return value === "all" ? undefined : value;
}

function urgencyFilterValue(value: string): "high" | "normal" | undefined {
  return value === "high" || value === "normal" ? value : undefined;
}

interface InboxFeedback {
  message: string;
  isError: boolean;
}

export function InboxContact(props: {
  contact: NonNullable<InboxWorkspaceEntry["item"]["contact"]>;
  href?: string | undefined;
  linked?: boolean | undefined;
}): ReactElement {
  const label = <span className="inbox-contact">{props.contact.label}</span>;
  if (!props.linked)
    return <b className="inbox-contact">{props.contact.label}</b>;
  if (!props.href) return label;
  return (
    <a
      className="inbox-contact-link"
      href={props.href}
      aria-label={`Open contact ${props.contact.label}`}
    >
      {label}
      <i aria-hidden="true">Open contact →</i>
    </a>
  );
}

export function UnifiedInboxWorkspace(props: {
  data: InboxWorkspaceSnapshot;
  query: CmsWorkspaceQuery;
  onQueryChange: (
    query: CmsWorkspaceQuery,
    canonicalUrlQuery?: CmsWorkspaceQuery,
  ) => void;
  onFollowUp: (followUp: InboxWorkspaceFollowUp) => void;
  onAction: (
    action: InboxWorkspaceAction,
  ) => Promise<InboxWorkspaceActionResult>;
}): ReactElement {
  const { data, query, onQueryChange, onFollowUp, onAction } = props;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InboxFeedback | null>(null);
  const [confirmation, setConfirmation] = useState<{
    action: InboxWorkspaceAction;
    summary: string;
    trigger: HTMLButtonElement;
  } | null>(null);
  // The projection is paged; older pages accumulate here. An offset-0 page
  // replaces the accumulation so filter changes and post-action re-lists
  // drop resolved rows instead of merging them back in.
  const [entries, setEntries] = useState<InboxWorkspaceEntry[]>(data.entries);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);
  const action = useWorkspaceAction<InboxWorkspaceActionResult>();

  useEffect(() => {
    setEntries((current) =>
      data.offset === 0 ? data.entries : mergeEntries(current, data.entries),
    );
  }, [data]);

  const selected = useMemo(
    () => entries.find((entry) => entryKey(entry) === selectedKey),
    [entries, selectedKey],
  );

  useEffect(() => {
    if (selected) detailHeadingRef.current?.focus();
  }, [selected]);

  const requestedSource =
    typeof query["sourceId"] === "string" ? query["sourceId"] : undefined;
  const sourceFilter = data.sources.some(
    (source) => source.source.sourceId === requestedSource,
  )
    ? requestedSource
    : undefined;
  const urgencyFilter =
    query["urgency"] === "high" || query["urgency"] === "normal"
      ? query["urgency"]
      : undefined;
  const limit =
    typeof query["limit"] === "number" ? query["limit"] : data.limit;
  const canonicalUrlQuery = useMemo<CmsWorkspaceQuery>(
    () => ({
      ...(sourceFilter !== undefined ? { sourceId: sourceFilter } : {}),
      ...(urgencyFilter !== undefined ? { urgency: urgencyFilter } : {}),
    }),
    [sourceFilter, urgencyFilter],
  );

  const filteredQuery = useCallback(
    (
      filters: {
        sourceId: string | undefined;
        urgency: "high" | "normal" | undefined;
      },
      offset: number,
    ): CmsWorkspaceQuery => ({
      ...(filters.sourceId !== undefined ? { sourceId: filters.sourceId } : {}),
      ...(filters.urgency !== undefined ? { urgency: filters.urgency } : {}),
      offset,
      limit,
    }),
    [limit],
  );

  useEffect(() => {
    if (workspaceUrlSearch(query) === workspaceUrlSearch(canonicalUrlQuery)) {
      return;
    }
    onQueryChange(
      filteredQuery({ sourceId: sourceFilter, urgency: urgencyFilter }, 0),
      canonicalUrlQuery,
    );
  }, [
    canonicalUrlQuery,
    filteredQuery,
    onQueryChange,
    query,
    sourceFilter,
    urgencyFilter,
  ]);

  const selectEntry = useCallback(
    (entry: InboxWorkspaceEntry, trigger: HTMLButtonElement): void => {
      originRef.current = trigger;
      setSelectedKey(entryKey(entry));
      setFeedback(null);
    },
    [],
  );

  const backToList = useCallback((): void => {
    setSelectedKey(null);
    window.setTimeout(() => originRef.current?.focus(), 0);
  }, []);

  const changeFilter = useCallback(
    (patch: {
      sourceId?: string | undefined;
      urgency?: "high" | "normal" | undefined;
    }): void => {
      setSelectedKey(null);
      originRef.current = null;
      setFeedback(null);
      const filters: {
        sourceId: string | undefined;
        urgency: "high" | "normal" | undefined;
      } = {
        sourceId: sourceFilter,
        urgency: urgencyFilter,
        ...patch,
      };
      const nextUrlQuery: CmsWorkspaceQuery = {
        ...(filters.sourceId !== undefined
          ? { sourceId: filters.sourceId }
          : {}),
        ...(filters.urgency !== undefined ? { urgency: filters.urgency } : {}),
      };
      onQueryChange(filteredQuery(filters, 0), nextUrlQuery);
    },
    [filteredQuery, onQueryChange, sourceFilter, urgencyFilter],
  );

  const loadMore = useCallback((): void => {
    onQueryChange(
      filteredQuery(
        { sourceId: sourceFilter, urgency: urgencyFilter },
        entries.length,
      ),
    );
  }, [
    entries.length,
    filteredQuery,
    onQueryChange,
    sourceFilter,
    urgencyFilter,
  ]);

  const execute = useCallback(
    async (
      request: InboxWorkspaceAction,
      trigger: HTMLButtonElement,
    ): Promise<void> => {
      setFeedback(null);
      const result = await action.run(actionKey(request), () =>
        onAction(request),
      );
      if (!result) return;
      if (result.kind === "confirmation") {
        setConfirmation({ action: request, summary: result.summary, trigger });
      } else if (result.kind === "error") {
        setFeedback({ message: result.error, isError: true });
      } else {
        setFeedback({ message: "Inbox updated.", isError: false });
        setSelectedKey(null);
        onQueryChange(
          filteredQuery({ sourceId: sourceFilter, urgency: urgencyFilter }, 0),
        );
      }
    },
    [
      action,
      filteredQuery,
      onAction,
      onQueryChange,
      sourceFilter,
      urgencyFilter,
    ],
  );

  const closeConfirmation = useCallback((): void => {
    const trigger = confirmation?.trigger;
    setConfirmation(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }, [confirmation]);

  const confirmAction = useCallback((): void => {
    if (!confirmation) return;
    const { action: request, trigger } = confirmation;
    setConfirmation(null);
    trigger.focus();
    void execute({ ...request, confirmed: true }, trigger);
  }, [confirmation, execute]);

  const statusMessage = action.error ?? feedback?.message ?? "";
  const statusIsError = action.error !== null || feedback?.isError === true;
  const hasMore = entries.length < data.total;

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
            {data.summary.open}
            <small>open</small>
          </strong>
          <strong className={data.summary.high > 0 ? "needs" : ""}>
            {data.summary.high}
            <small>high priority</small>
          </strong>
        </div>
      </header>

      <section className="inbox-source-health" aria-label="Source availability">
        {data.sources.map((source) => (
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
            value={sourceFilter ?? "all"}
            onChange={(event) =>
              changeFilter({ sourceId: sourceFilterValue(event.target.value) })
            }
          >
            <option value="all">All sources</option>
            {data.sources.map((source) => (
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
            value={urgencyFilter ?? "all"}
            onChange={(event) =>
              changeFilter({ urgency: urgencyFilterValue(event.target.value) })
            }
          >
            <option value="all">All urgency</option>
            <option value="high">High priority</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <span>
          {entries.length} shown · {data.total} matching
        </span>
      </section>

      {data.errors.length > 0 && (
        <aside className="inbox-source-errors" role="status">
          {data.errors.map((error) => (
            <span key={error.source.sourceId}>
              {error.source.displayName} is temporarily unavailable.
            </span>
          ))}
        </aside>
      )}

      <p
        className={
          statusIsError
            ? "status status-error inbox-feedback"
            : "status inbox-feedback"
        }
        aria-live="polite"
      >
        {statusMessage}
      </p>

      <div className="inbox-workspace-grid">
        <section className="inbox-list-pane" aria-label="Inbox items">
          {entries.length === 0 ? (
            <p className="inbox-empty">
              Nothing needs attention for these filters.
            </p>
          ) : (
            <ol>
              {entries.map((entry) => {
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
                        {entry.item.contact && (
                          <>
                            <InboxContact contact={entry.item.contact} /> ·{" "}
                          </>
                        )}
                        {entry.item.threadOrdinal !== undefined && (
                          <>message {entry.item.threadOrdinal} in thread · </>
                        )}
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
              onClick={loadMore}
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
                <small className="inbox-detail-context">
                  {selected.item.contact && (
                    <>
                      <InboxContact
                        contact={selected.item.contact}
                        href={selected.contactHref}
                        linked
                      />
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {selected.item.threadOrdinal !== undefined && (
                    <>
                      <span>
                        message {selected.item.threadOrdinal} in thread
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{selected.source.displayName}</span>
                </small>
              </header>
              {selected.item.summary ? (
                <p className="inbox-detail-summary">{selected.item.summary}</p>
              ) : (
                <p className="inbox-detail-summary is-muted">
                  This source supplied no additional summary.
                </p>
              )}
              {selected.followUps.length > 0 && (
                <section
                  className="inbox-follow-ups"
                  aria-label={`Follow-ups for ${selected.item.title}`}
                >
                  <span>Follow up</span>
                  <nav>
                    {selected.followUps.map((followUp) => (
                      <button
                        type="button"
                        key={followUp.kind}
                        onClick={() => onFollowUp(followUp)}
                      >
                        {followUp.label}
                      </button>
                    ))}
                  </nav>
                </section>
              )}
              <footer>
                <span>Available actions</span>
                <nav aria-label={`Actions for ${selected.item.title}`}>
                  {selected.item.actions.map((offered) => {
                    const request: InboxWorkspaceAction = {
                      sourceId: selected.source.sourceId,
                      itemId: selected.item.id,
                      actionId: offered.id,
                    };
                    return (
                      <button
                        type="button"
                        className={
                          offered.confirm ? "requires-confirmation" : ""
                        }
                        disabled={action.pendingKey !== null}
                        key={offered.id}
                        onClick={(event) =>
                          void execute(request, event.currentTarget)
                        }
                      >
                        {action.pendingKey === actionKey(request)
                          ? "Working…"
                          : offered.label}
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
        <ConfirmDialog
          mark="!"
          title="Run this inbox action?"
          titleId="inbox-confirmation-title"
          cancelLabel="Cancel"
          confirmLabel={
            action.pendingKey !== null ? "Working…" : "Confirm action"
          }
          pending={action.pendingKey !== null}
          onCancel={closeConfirmation}
          onConfirm={confirmAction}
        >
          <p id="inbox-confirmation-summary">{confirmation.summary}</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
