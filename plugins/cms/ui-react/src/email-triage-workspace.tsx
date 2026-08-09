/** @jsxImportSource react */
import { useCallback, useState, type ReactElement } from "react";
import type {
  MailTriageCategory,
  MailTriageListItem,
  MailTriagePriority,
  MailTriageStatus,
  MailTriageStatusAction,
  MailTriageStatusActionResult,
  MailTriageWorkspaceSnapshot,
} from "./api";
import { formatUpdated, useWorkspaceAction } from "./ui-utils";

export interface MailTriageFilters {
  category?: MailTriageCategory | null;
  priority?: MailTriagePriority;
  status?: MailTriageStatus;
  needsReply?: boolean;
}

export function filterMailTriageItems(
  items: MailTriageListItem[],
  filters: MailTriageFilters,
): MailTriageListItem[] {
  return items.filter(
    (item) =>
      (filters.category === undefined || item.category === filters.category) &&
      (filters.priority === undefined || item.priority === filters.priority) &&
      (filters.status === undefined || item.status === filters.status) &&
      (filters.needsReply === undefined ||
        item.needsReply === filters.needsReply),
  );
}

function actionsForItem(item: MailTriageListItem): MailTriageStatusAction[] {
  if (item.status === "archived") return [];
  const actions: MailTriageStatusAction[] = [];
  if (item.status === "new") {
    actions.push({ type: "mark-reviewed", id: item.id });
  }
  if (item.status === "new" || item.status === "reviewed") {
    actions.push({ type: "mark-handled", id: item.id });
  }
  actions.push({ type: "archive", id: item.id });
  return actions;
}

function actionLabel(type: MailTriageStatusAction["type"]): string {
  switch (type) {
    case "mark-reviewed":
      return "Mark reviewed";
    case "mark-handled":
      return "Mark handled";
    case "archive":
      return "Archive";
  }
}

function categoryValue(
  value: string,
): MailTriageCategory | "unclassified" | "all" {
  switch (value) {
    case "opportunity":
    case "recruiting":
    case "work":
    case "administrative":
    case "personal":
    case "unclassified":
      return value;
    default:
      return "all";
  }
}

function priorityValue(value: string): MailTriagePriority | "all" {
  switch (value) {
    case "high":
    case "normal":
    case "low":
      return value;
    default:
      return "all";
  }
}

function statusValue(value: string): MailTriageStatus | "all" {
  switch (value) {
    case "new":
    case "reviewed":
    case "handled":
    case "archived":
      return value;
    default:
      return "all";
  }
}

export function EmailTriageWorkspace(props: {
  data: MailTriageWorkspaceSnapshot;
  onAction: (
    action: MailTriageStatusAction,
  ) => Promise<MailTriageStatusActionResult>;
}): ReactElement {
  const [category, setCategory] = useState<
    MailTriageCategory | "unclassified" | "all"
  >("all");
  const [priority, setPriority] = useState<MailTriagePriority | "all">("all");
  const [status, setStatus] = useState<MailTriageStatus | "all">("new");
  const [reply, setReply] = useState<"all" | "yes" | "no">("all");
  const {
    pendingKey: pending,
    error,
    run,
  } = useWorkspaceAction<MailTriageStatusActionResult>();
  const filters: MailTriageFilters = {
    ...(category === "unclassified"
      ? { category: null }
      : category !== "all"
        ? { category }
        : {}),
    ...(priority !== "all" ? { priority } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(reply !== "all" ? { needsReply: reply === "yes" } : {}),
  };
  const items = filterMailTriageItems(props.data.items, filters);

  const { onAction } = props;
  const execute = useCallback(
    async (action: MailTriageStatusAction): Promise<void> => {
      await run(`${action.id}:${action.type}`, () => onAction(action));
    },
    [onAction, run],
  );

  return (
    <main className="mail-triage-workspace">
      <header className="mail-triage-head">
        <div>
          <span>Restricted routing summaries</span>
          <h2>Mail desk</h2>
          <p>
            Review what needs attention without copying the original mailbox
            into Brain.
          </p>
        </div>
        <strong>
          {props.data.summary.new}
          <small>new arrivals</small>
        </strong>
      </header>

      <section className="mail-triage-vitals" aria-label="Mail summary">
        <div>
          <span>New</span>
          <b>{props.data.summary.new}</b>
        </div>
        <div className={props.data.summary.high > 0 ? "needs" : ""}>
          <span>High priority</span>
          <b>{props.data.summary.high}</b>
        </div>
        <div>
          <span>Needs reply</span>
          <b>{props.data.summary.needsReply}</b>
        </div>
        <div className={props.data.summary.unclassified > 0 ? "needs" : ""}>
          <span>Unclassified</span>
          <b>{props.data.summary.unclassified}</b>
        </div>
      </section>

      <section className="mail-triage-filters" aria-label="Mail filters">
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(categoryValue(event.target.value))}
          >
            <option value="all">All categories</option>
            <option value="opportunity">Opportunity</option>
            <option value="recruiting">Recruiting</option>
            <option value="work">Work</option>
            <option value="administrative">Administrative</option>
            <option value="personal">Personal</option>
            <option value="unclassified">Unclassified</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={priority}
            onChange={(event) => setPriority(priorityValue(event.target.value))}
          >
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(statusValue(event.target.value))}
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="handled">Handled</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          <span>Needs reply</span>
          <select
            value={reply}
            onChange={(event) =>
              setReply(
                event.target.value === "yes" || event.target.value === "no"
                  ? event.target.value
                  : "all",
              )
            }
          >
            <option value="all">Either</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <span className="mail-triage-filter-count">
          {items.length} shown · {props.data.summary.total} records
        </span>
      </section>

      {error && <p className="status status-error">{error}</p>}

      <section className="mail-triage-list" aria-live="polite">
        {items.length === 0 ? (
          <p className="mail-triage-empty">
            No mail in the recent snapshot matches these filters.
          </p>
        ) : (
          items.map((item) => (
            <article className="mail-triage-item" key={item.id}>
              <header>
                <div>
                  <span className={`mail-priority ${item.priority}`}>
                    {item.priority}
                  </span>
                  <span className="mail-category">
                    {item.category ?? "unclassified"}
                  </span>
                  {item.needsReply && <span className="mail-reply">reply</span>}
                </div>
                <time>{formatUpdated(item.receivedAt)}</time>
              </header>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              {item.organization && (
                <small className="mail-organization">
                  Organization · {item.organization}
                </small>
              )}
              {item.requestedActions.length > 0 && (
                <ul>
                  {item.requestedActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              )}
              <footer>
                <span className={`mail-status ${item.status}`}>
                  {item.status}
                </span>
                <nav aria-label={`Actions for ${item.title}`}>
                  {actionsForItem(item).map((action) => {
                    const key = `${action.id}:${action.type}`;
                    return (
                      <button
                        type="button"
                        className={
                          action.type === "archive" ? "mail-archive" : ""
                        }
                        disabled={pending !== null}
                        key={action.type}
                        onClick={() => void execute(action)}
                      >
                        {pending === key
                          ? "Working…"
                          : actionLabel(action.type)}
                      </button>
                    );
                  })}
                </nav>
              </footer>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
