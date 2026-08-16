/** @jsxImportSource react */
import type {
  RuntimeCmsOperatorPanelBlock,
  RuntimeCmsOperatorView,
  RuntimeCmsWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
  RuntimePreparedConfirmation,
  RuntimeOperatorScalar,
} from "@brains/plugins";
import { useState, type ReactElement, type ReactNode } from "react";
import type { CmsWorkspaceQuery } from "./queries";

type RuntimeBlock = RuntimeCmsOperatorView["blocks"][number];

function displayScalar(value: RuntimeOperatorScalar): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

function displayCell(
  value: RuntimeOperatorScalar | readonly string[] | undefined,
): string {
  return isStringArray(value)
    ? value.join(", ")
    : displayScalar(value === undefined ? null : value);
}

function OperatorLink(props: {
  target: RuntimeOperatorLinkTarget;
  children: ReactNode;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  if (props.target.kind === "external") {
    return (
      <a href={props.target.href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    );
  }
  if (props.target.kind === "launch") {
    const launch = props.target.launch;
    return (
      <button
        type="button"
        className="declarative-inline-link"
        onClick={() => props.onLaunch(launch)}
      >
        {props.children}
      </button>
    );
  }
  const { entityType, id } = props.target;
  return (
    <button
      type="button"
      className="declarative-inline-link"
      onClick={() => props.onOpenEntity(entityType, id)}
    >
      {props.children}
    </button>
  );
}

function isPreparedConfirmation(
  value: unknown,
): value is RuntimePreparedConfirmation {
  if (typeof value !== "object" || value === null) return false;
  return (
    "kind" in value &&
    value.kind === "prepared-confirmation" &&
    "token" in value &&
    typeof value.token === "string" &&
    "summary" in value &&
    typeof value.summary === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string"
  );
}

function ActionButton(props: {
  action: RuntimeOperatorActionControl;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const execute = async (): Promise<void> => {
    const confirmation = props.action.confirmation;
    if (
      confirmation?.kind === "static" &&
      !window.confirm(confirmation.message)
    ) {
      return;
    }
    setPending(true);
    setMessage("");
    try {
      let invocation = props.action;
      if (confirmation?.kind === "prepared") {
        const prepared = await props.onAction({
          ...props.action,
          invocation: { mode: "prepare" },
        });
        if (!isPreparedConfirmation(prepared)) {
          throw new Error("Invalid prepared confirmation");
        }
        if (!window.confirm(prepared.summary)) return;
        invocation = {
          ...props.action,
          invocation: { mode: "execute", token: prepared.token },
        };
      }
      await props.onAction(invocation);
      setMessage("Completed.");
    } catch {
      setMessage("Action failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="declarative-action-control">
      <button
        type="button"
        className="btn"
        disabled={pending || props.action.disabled === true}
        onClick={() => void execute()}
      >
        {pending ? "Working…" : props.action.label}
      </button>
      {message && <small aria-live="polite">{message}</small>}
    </span>
  );
}

function Actions(props: {
  actions: readonly RuntimeOperatorActionControl[];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
}): ReactElement | null {
  if (props.actions.length === 0) return null;
  return (
    <div className="declarative-actions">
      {props.actions.map((action, index) => (
        <ActionButton
          key={`${action.actionId}:${action.capabilityId ?? "static"}:${index}`}
          action={action}
          onAction={props.onAction}
        />
      ))}
    </div>
  );
}

function StatsBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "stats" }>;
}): ReactElement {
  return (
    <dl className="declarative-stats">
      {block.items.map((item, index) => (
        <div key={`${item.label}:${index}`} data-tone={item.tone ?? "neutral"}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function KeyValuesBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "key-values" }>;
}): ReactElement {
  return (
    <dl className="declarative-key-values">
      {block.items.map((item, index) => (
        <div key={`${item.label}:${index}`}>
          <dt>{item.label}</dt>
          <dd>{displayScalar(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NoticeBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "notice" }>;
}): ReactElement {
  return (
    <aside className="declarative-notice" data-tone={block.tone ?? "neutral"}>
      {block.title && <strong>{block.title}</strong>}
      <p>{block.text}</p>
    </aside>
  );
}

function LinksBlock(props: {
  block: Extract<RuntimeBlock, { type: "links" }>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <nav className="declarative-links" aria-label="Workspace links">
      {props.block.items.map((item, index) => (
        <OperatorLink
          key={`${item.label}:${index}`}
          target={item.target}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        >
          {item.label}
        </OperatorLink>
      ))}
    </nav>
  );
}

type RuntimeListItem = Extract<
  RuntimeCmsOperatorPanelBlock,
  { type: "list" }
>["items"][number];

function ListItems(props: {
  items: readonly RuntimeListItem[];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <ol className="declarative-list">
      {props.items.map((item) => {
        const metadata = [
          ...(item.meta ? [item.meta] : []),
          ...(item.metadata ?? []),
        ];
        return (
          <li key={item.id} data-tone={item.tone ?? "neutral"}>
            <div>
              <strong>
                {item.link ? (
                  <OperatorLink
                    target={item.link}
                    onOpenEntity={props.onOpenEntity}
                    onLaunch={props.onLaunch}
                  >
                    {item.title}
                  </OperatorLink>
                ) : (
                  item.title
                )}
              </strong>
              {item.description && <p>{item.description}</p>}
              {metadata.length > 0 && <small>{metadata.join(" · ")}</small>}
              {item.links && item.links.length > 0 && (
                <nav
                  className="declarative-links"
                  aria-label={`${item.title} links`}
                >
                  {item.links.map((link, index) => (
                    <OperatorLink
                      key={`${link.label}:${index}`}
                      target={link.target}
                      onOpenEntity={props.onOpenEntity}
                      onLaunch={props.onLaunch}
                    >
                      {link.label}
                    </OperatorLink>
                  ))}
                </nav>
              )}
              {item.tags && item.tags.length > 0 && (
                <span className="declarative-tags">
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </span>
              )}
            </div>
            <div className="declarative-list-trailing">
              {item.count !== undefined && <span>{item.count}</span>}
              {item.badges?.map((badge, index) => (
                <span
                  key={`${badge.label}:${index}`}
                  className="declarative-badge"
                  data-tone={badge.tone ?? "neutral"}
                >
                  {badge.label}
                </span>
              ))}
              <Actions actions={item.actions ?? []} onAction={props.onAction} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ListBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "list" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  const [activeFilter, setActiveFilter] = useState(
    props.block.filter?.defaultValue ?? "all",
  );
  const allValue = props.block.filter?.allValue ?? "all";
  const items = props.block.items.filter(
    (item) =>
      !props.block.filter ||
      activeFilter === allValue ||
      item.filterValues?.includes(activeFilter),
  );
  if (props.block.items.length === 0) {
    return <p className="declarative-empty">{props.block.empty}</p>;
  }
  return (
    <div>
      {props.block.filter && (
        <div
          className="declarative-filter"
          aria-label={props.block.filter.label}
        >
          {props.block.filter.options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={activeFilter === option.value}
              data-emphasis={option.emphasis}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.label}
              {option.count !== undefined ? ` (${option.count})` : ""}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className="declarative-empty">{props.block.empty}</p>
      ) : (
        <ListItems
          items={items}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      )}
    </div>
  );
}

function TableBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "table" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  if (props.block.rows.length === 0) {
    return <p className="declarative-empty">{props.block.empty}</p>;
  }
  const hasActions = props.block.rows.some(
    (row) => (row.actions?.length ?? 0) > 0,
  );
  return (
    <div className="declarative-table-scroll">
      <table className="declarative-table">
        <thead>
          <tr>
            {props.block.columns.map((column) => (
              <th key={column.key} data-align={column.align ?? "start"}>
                {column.label}
              </th>
            ))}
            {hasActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {props.block.rows.map((row) => (
            <tr key={row.id}>
              {props.block.columns.map((column, index) => {
                const value = displayCell(row.cells[column.key]);
                return (
                  <td key={column.key} data-align={column.align ?? "start"}>
                    {index === 0 && row.link ? (
                      <OperatorLink
                        target={row.link}
                        onOpenEntity={props.onOpenEntity}
                        onLaunch={props.onLaunch}
                      >
                        {value}
                      </OperatorLink>
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
              {hasActions && (
                <td>
                  <Actions
                    actions={row.actions ?? []}
                    onAction={props.onAction}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "group" }>;
}): ReactElement {
  return (
    <section
      className="declarative-group"
      aria-labelledby={`${props.block.id}-title`}
    >
      <h3 id={`${props.block.id}-title`}>{props.block.label}</h3>
      <dl>
        {props.block.items.map((item) => (
          <div key={item.id} data-tone={item.tone ?? "neutral"}>
            <dt>{item.label}</dt>
            {item.value !== undefined && <dd>{displayScalar(item.value)}</dd>}
            {item.description && <small>{item.description}</small>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function FlowBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "flow" }>;
}): ReactElement {
  return (
    <section
      className="declarative-flow"
      aria-labelledby={`${props.block.id}-title`}
    >
      <h3 id={`${props.block.id}-title`}>{props.block.label}</h3>
      <ol data-direction={props.block.direction ?? "forward"}>
        {props.block.steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span aria-hidden="true" />
            <strong>{step.label}</strong>
            {step.detail && <small>{step.detail}</small>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetersBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "meters" }>;
}): ReactElement {
  return (
    <dl className="declarative-meters">
      {props.block.items.map((item) => (
        <div key={item.id} data-tone={item.tone ?? "neutral"}>
          <dt>{item.label}</dt>
          <dd>
            <span>
              {item.value}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
            {item.max !== undefined && (
              <progress value={item.value} max={item.max}>
                {item.value} / {item.max}
              </progress>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProgressBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "progress" }>;
}): ReactElement {
  return (
    <section
      className="declarative-progress"
      data-tone={props.block.tone ?? "neutral"}
    >
      <header>
        <strong>{props.block.label}</strong>
        <span>{props.block.state}</span>
      </header>
      {props.block.progress !== undefined && (
        <progress value={props.block.progress} max={1}>
          {Math.round(props.block.progress * 100)}%
        </progress>
      )}
      {props.block.detail && <p>{props.block.detail}</p>}
      {(props.block.startedAt ?? props.block.updatedAt) && (
        <small>
          {props.block.startedAt ? `Started ${props.block.startedAt}` : ""}
          {props.block.startedAt && props.block.updatedAt ? " · " : ""}
          {props.block.updatedAt ? `Updated ${props.block.updatedAt}` : ""}
        </small>
      )}
    </section>
  );
}

function QueryBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "query" }>;
  query: CmsWorkspaceQuery;
  onQueryChange: (query: CmsWorkspaceQuery) => void;
}): ReactElement {
  const change = (key: string, value: string): void => {
    const next: Record<string, string | number | undefined> = {
      ...props.query,
      offset: 0,
    };
    if (value === "") delete next[key];
    else next[key] = value;
    props.onQueryChange(next);
  };
  const pagination = props.block.pagination;
  const shown = pagination
    ? Math.min(pagination.offset + pagination.limit, pagination.total)
    : 0;
  return (
    <section className="declarative-query" aria-label="Workspace filters">
      <div>
        {props.block.controls.map((control) => (
          <label key={control.key}>
            <span>{control.label}</span>
            <select
              value={control.value ?? ""}
              onChange={(event) => change(control.key, event.target.value)}
            >
              <option value="">{control.allLabel ?? "All"}</option>
              {control.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.count === undefined ? "" : ` (${option.count})`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {pagination && (
        <footer>
          <span>
            {shown} of {pagination.total}
          </span>
          {shown < pagination.total && (
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                props.onQueryChange({
                  ...props.query,
                  offset: pagination.offset + pagination.limit,
                  limit: pagination.limit,
                })
              }
            >
              {pagination.label ?? "Load more"}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

function MatrixBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "matrix" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <div
      className="declarative-matrix"
      style={{
        gridTemplateColumns: `repeat(${props.block.columns ?? 2}, minmax(0, 1fr))`,
      }}
    >
      {props.block.cells.map((cell) => (
        <section key={cell.id} data-tone={cell.tone ?? "neutral"}>
          <h3>{cell.label}</h3>
          {cell.items.length === 0 ? (
            <p className="declarative-empty">{cell.empty}</p>
          ) : (
            <ListItems
              items={cell.items}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
            />
          )}
        </section>
      ))}
    </div>
  );
}

function SpatialBlock(props: {
  block: Extract<RuntimeCmsOperatorPanelBlock, { type: "spatial" }>;
}): ReactElement {
  return (
    <figure className="declarative-spatial" aria-label={props.block.label}>
      <figcaption>
        <strong>{props.block.label}</strong>
        <p>{props.block.description}</p>
      </figcaption>
      <ol>
        {props.block.points.map((point) => (
          <li key={point.id}>
            <strong>{point.label}</strong>
            <span>
              {"category" in point
                ? point.category
                : `${point.kind} · ${point.status}`}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function PanelBlock(props: {
  block: RuntimeCmsOperatorPanelBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: CmsWorkspaceQuery;
  onQueryChange: (query: CmsWorkspaceQuery) => void;
}): ReactElement {
  switch (props.block.type) {
    case "stats":
      return <StatsBlock block={props.block} />;
    case "key-values":
      return <KeyValuesBlock block={props.block} />;
    case "notice":
      return <NoticeBlock block={props.block} />;
    case "group":
      return <GroupBlock block={props.block} />;
    case "flow":
      return <FlowBlock block={props.block} />;
    case "meters":
      return <MetersBlock block={props.block} />;
    case "progress":
      return <ProgressBlock block={props.block} />;
    case "query":
      return (
        <QueryBlock
          block={props.block}
          query={props.query}
          onQueryChange={props.onQueryChange}
        />
      );
    case "links":
      return (
        <LinksBlock
          block={props.block}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "list":
      return (
        <ListBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "table":
      return (
        <TableBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "matrix":
      return (
        <MatrixBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "spatial":
      return <SpatialBlock block={props.block} />;
    case "action":
      return <ActionButton action={props.block} onAction={props.onAction} />;
    case "actions":
      return <Actions actions={props.block.items} onAction={props.onAction} />;
  }
}

function ViewBlock(props: {
  block: RuntimeBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: CmsWorkspaceQuery;
  onQueryChange: (query: CmsWorkspaceQuery) => void;
}): ReactElement {
  const [activeTab, setActiveTab] = useState(
    props.block.type === "tabs" ? props.block.defaultTab : "",
  );
  if (props.block.type !== "tabs") {
    return (
      <PanelBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  const active =
    props.block.tabs.find((tab) => tab.id === activeTab) ?? props.block.tabs[0];
  return (
    <div className="declarative-tabs">
      <div role="tablist" aria-label={props.block.label}>
        {props.block.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined ? ` (${tab.count})` : ""}
          </button>
        ))}
      </div>
      {active && (
        <div role="tabpanel">
          {active.blocks.map((block, index) => (
            <section key={block.id ?? `${block.type}:${index}`}>
              <PanelBlock
                block={block}
                onAction={props.onAction}
                onOpenEntity={props.onOpenEntity}
                onLaunch={props.onLaunch}
                query={props.query}
                onQueryChange={props.onQueryChange}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeclarativeWorkspace(props: {
  data: RuntimeCmsWorkspaceData;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch?: ((launch: RuntimeOperatorLaunchIntent) => void) | undefined;
  query?: CmsWorkspaceQuery | undefined;
  onQueryChange?: ((query: CmsWorkspaceQuery) => void) | undefined;
}): ReactElement {
  return (
    <main className="declarative-workspace">
      {props.data.view.title && <h2>{props.data.view.title}</h2>}
      <div className="declarative-blocks">
        {props.data.view.blocks.map((block, index) => (
          <section key={block.id ?? `${block.type}:${index}`}>
            <ViewBlock
              block={block}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch ?? ((): void => {})}
              query={props.query ?? {}}
              onQueryChange={props.onQueryChange ?? ((): void => {})}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
