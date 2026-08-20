/** @jsxImportSource react */
import type {
  RuntimeCmsOperatorBlock,
  RuntimeCmsOperatorPanelBlock,
  RuntimeCmsOperatorRegionBlock,
  RuntimeCmsOperatorView,
  RuntimeCmsWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
  RuntimePreparedConfirmation,
  RuntimeOperatorScalar,
} from "@brains/plugins";
import { WidgetTabs } from "@brains/ui-library";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "./confirm-dialog";

export type OperatorViewQuery = Readonly<
  Record<string, string | number | undefined>
>;

type RuntimeBlock = RuntimeCmsOperatorView["blocks"][number];

interface OperatorRendererHost {
  readonly resolveLink?:
    ((target: RuntimeOperatorLinkTarget) => string | undefined) | undefined;
  readonly renderAllTabs: boolean;
}

const OperatorRendererHostContext = createContext<OperatorRendererHost>({
  renderAllTabs: false,
});

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

/**
 * A detail target names no block, so the handler comes from the enclosing
 * detail rather than from a prop threaded through every collection. Outside a
 * detail the context is absent and the link renders inert.
 */
const OpenDetailContext = createContext<((itemId: string) => void) | null>(
  null,
);

function OperatorLink(props: {
  target: RuntimeOperatorLinkTarget;
  children: ReactNode;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  const openDetail = useContext(OpenDetailContext);
  const host = useContext(OperatorRendererHostContext);
  const resolvedHref = host.resolveLink?.(props.target);
  if (resolvedHref) {
    const external = props.target.kind === "external";
    return (
      <a
        className="declarative-inline-link operator-inline-link"
        href={resolvedHref}
        {...(external && { target: "_blank", rel: "noreferrer" })}
      >
        {props.children}
      </a>
    );
  }
  if (props.target.kind === "external") {
    return (
      <a href={props.target.href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    );
  }
  if (props.target.kind === "detail") {
    const { itemId } = props.target;
    if (!openDetail) return <>{props.children}</>;
    return (
      <button
        type="button"
        className="declarative-inline-link"
        onClick={() => openDetail(itemId)}
      >
        {props.children}
      </button>
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

interface AwaitingConfirmation {
  readonly summary: string;
  readonly invocation: RuntimeOperatorActionControl;
}

/**
 * Consequence, not position, decides an action's weight: anything that asks for
 * confirmation is marked, anything attached to a row stays subordinate to it,
 * and a standalone action is the surface's primary call to action.
 */
function actionClassName(
  action: RuntimeOperatorActionControl,
  subordinate: boolean,
): string {
  if (action.confirmation) return "btn danger";
  return subordinate ? "btn ghost" : "btn";
}

function ActionButton(props: {
  action: RuntimeOperatorActionControl;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  subordinate?: boolean;
}): ReactElement {
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [awaiting, setAwaiting] = useState<AwaitingConfirmation | null>(null);

  const run = async (
    invocation: RuntimeOperatorActionControl,
  ): Promise<void> => {
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      await props.onAction(invocation);
      setMessage("Completed.");
    } catch {
      setMessage("Action failed.");
      setFailed(true);
    } finally {
      setPending(false);
      setAwaiting(null);
    }
  };

  const start = async (): Promise<void> => {
    const confirmation = props.action.confirmation;
    if (confirmation?.kind === "static") {
      setAwaiting({
        summary: confirmation.message,
        invocation: props.action,
      });
      return;
    }
    if (confirmation?.kind !== "prepared") {
      await run(props.action);
      return;
    }
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const prepared = await props.onAction({
        ...props.action,
        invocation: { mode: "prepare" },
      });
      if (!isPreparedConfirmation(prepared)) {
        throw new Error("Invalid prepared confirmation");
      }
      setAwaiting({
        summary: prepared.summary,
        invocation: {
          ...props.action,
          invocation: { mode: "execute", token: prepared.token },
        },
      });
    } catch {
      setMessage("Action failed.");
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <span className="declarative-action-control">
        <button
          type="button"
          className={actionClassName(props.action, props.subordinate === true)}
          disabled={pending || props.action.disabled === true}
          onClick={() => void start()}
        >
          {pending ? "Working…" : props.action.label}
        </button>
        {message && (
          <small
            className={failed ? "status status-error" : "status"}
            aria-live="polite"
          >
            {message}
          </small>
        )}
      </span>
      {awaiting && (
        <ConfirmDialog
          mark="!"
          title="Run this workspace action?"
          titleId={titleId}
          cancelLabel="Cancel"
          confirmLabel={pending ? "Working…" : "Confirm action"}
          pending={pending}
          onCancel={() => setAwaiting(null)}
          onConfirm={() => void run(awaiting.invocation)}
        >
          <p>{awaiting.summary}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function Actions(props: {
  actions: readonly RuntimeOperatorActionControl[];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  subordinate?: boolean;
}): ReactElement | null {
  if (props.actions.length === 0) return null;
  return (
    <div className="declarative-actions">
      {props.actions.map((action, index) => (
        <ActionButton
          key={`${action.actionId}:${action.capabilityId ?? "static"}:${index}`}
          action={action}
          onAction={props.onAction}
          subordinate={props.subordinate === true}
        />
      ))}
    </div>
  );
}

function StatsBlock({
  block,
  className = "declarative-stats operator-stats",
}: {
  block: Extract<RuntimeBlock, { type: "stats" }>;
  className?: string;
}): ReactElement {
  return (
    <dl className={className}>
      {block.items.map((item, index) => (
        <div key={`${item.label}:${index}`} data-tone={item.tone ?? "neutral"}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.caption && (
            <span className="declarative-stat-caption">{item.caption}</span>
          )}
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
    <dl className="declarative-key-values operator-key-values">
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
    <aside
      className="declarative-notice operator-notice"
      data-tone={block.tone ?? "neutral"}
    >
      {block.title && <strong>{block.title}</strong>}
      <p>{block.text}</p>
    </aside>
  );
}

function TextBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "text" }>;
}): ReactElement {
  return (
    <article className="declarative-text">
      {block.label && <h3>{block.label}</h3>}
      <pre>{block.text}</pre>
      {block.truncated === true && (
        <small>Source content was truncated by its provider.</small>
      )}
    </article>
  );
}

function LinksBlock(props: {
  block: Extract<RuntimeBlock, { type: "links" }>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <nav
      className="declarative-links operator-links"
      aria-label="Workspace links"
    >
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
  openId?: string | undefined;
}): ReactElement {
  return (
    <ol className="declarative-list operator-list">
      {props.items.map((item) => {
        const metadata = [
          ...(item.meta ? [item.meta] : []),
          ...(item.metadata ?? []),
        ];
        return (
          <li
            key={item.id}
            data-tone={item.tone ?? "neutral"}
            {...(props.openId === item.id ? { "aria-current": "true" } : {})}
          >
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
              <Actions
                actions={item.actions ?? []}
                onAction={props.onAction}
                subordinate
              />
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
  openId?: string | undefined;
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
          openId={props.openId}
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
  openId?: string | undefined;
}): ReactElement {
  if (props.block.rows.length === 0) {
    return <p className="declarative-empty">{props.block.empty}</p>;
  }
  const hasActions = props.block.rows.some(
    (row) => (row.actions?.length ?? 0) > 0,
  );
  return (
    <div className="declarative-table-scroll operator-table-scroll">
      <table className="declarative-table operator-table">
        <thead>
          <tr>
            {props.block.columns.map((column) => (
              <th key={column.key} data-align={column.align ?? "start"}>
                {column.label}
              </th>
            ))}
            {hasActions && <th data-align="end">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {props.block.rows.map((row) => (
            <tr
              key={row.id}
              {...(props.openId === row.id ? { "aria-current": "true" } : {})}
            >
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
                <td data-align="end">
                  <Actions
                    actions={row.actions ?? []}
                    onAction={props.onAction}
                    subordinate
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
      className="declarative-group operator-group"
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
      className="declarative-flow operator-flow"
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
    <dl className="declarative-meters operator-meters">
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
      className="declarative-progress operator-progress"
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
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
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
          {/* The window is replaced, not appended: a triage list is worked from
              the top and its rows leave as they are handled, so an accumulating
              list would shift under the operator. That makes saying which slice
              is shown, and offering the way back, part of the control. */}
          <span>
            {pagination.total === 0
              ? "Nothing to show"
              : `${pagination.offset + 1}–${shown} of ${pagination.total}`}
          </span>
          <span className="declarative-pager">
            <button
              type="button"
              className="btn ghost"
              disabled={pagination.offset === 0}
              onClick={() =>
                props.onQueryChange({
                  ...props.query,
                  offset: Math.max(0, pagination.offset - pagination.limit),
                  limit: pagination.limit,
                })
              }
            >
              Previous
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={shown >= pagination.total}
              onClick={() =>
                props.onQueryChange({
                  ...props.query,
                  offset: pagination.offset + pagination.limit,
                  limit: pagination.limit,
                })
              }
            >
              {pagination.label ?? "Next"}
            </button>
          </span>
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
      className="declarative-matrix operator-matrix"
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

type RuntimeSpatialBlock = Extract<
  RuntimeCmsOperatorPanelBlock,
  { type: "spatial" }
>;

interface SpatialPosition {
  readonly x: number;
  readonly y: number;
}

function radialPosition(distance: number, bearing: number): SpatialPosition {
  const radians = ((bearing - 90) * Math.PI) / 180;
  const radius = distance * 45;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius,
  };
}

function spatialPositions(
  block: RuntimeSpatialBlock,
): ReadonlyMap<string, SpatialPosition> {
  const positions = new Map<string, SpatialPosition>();
  if (block.layout === "cartesian") {
    for (const point of block.points) {
      positions.set(point.id, { x: point.x * 100, y: point.y * 100 });
    }
    for (const zone of block.zones) {
      positions.set(zone.id, { x: zone.x * 100, y: zone.y * 100 });
    }
  } else {
    for (const point of block.points) {
      positions.set(point.id, radialPosition(point.distance, point.bearing));
    }
  }
  return positions;
}

function SpatialBlock({ block }: { block: RuntimeSpatialBlock }): ReactElement {
  const positions = spatialPositions(block);
  return (
    <figure
      className={`declarative-spatial operator-spatial operator-spatial--${block.layout}`}
      data-ui-spatial
      aria-label={block.label}
    >
      <div className="operator-spatial-canvas">
        <svg
          className="operator-spatial-lines"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {block.layout === "radial" &&
            block.strata.map((stratum) => (
              <ellipse
                key={stratum.id}
                cx="500"
                cy="300"
                rx={stratum.maxDistance * 450}
                ry={stratum.maxDistance * 270}
              />
            ))}
          {block.layout === "cartesian" &&
            block.zones.map((zone) => (
              <circle
                key={zone.id}
                className="operator-spatial-zone"
                cx={zone.x * 1000}
                cy={zone.y * 600}
                r="72"
              />
            ))}
          {(block.relationships ?? []).map((relationship, index) => {
            const source = positions.get(relationship.sourceId);
            const target = positions.get(relationship.targetId);
            if (!source || !target) return null;
            return (
              <line
                key={`${relationship.sourceId}:${relationship.targetId}:${index}`}
                data-tone={relationship.tone ?? "neutral"}
                x1={source.x * 10}
                y1={source.y * 6}
                x2={target.x * 10}
                y2={target.y * 6}
              />
            );
          })}
        </svg>
        {block.layout === "radial" && (
          <span
            className="operator-spatial-center"
            data-kind={block.centerKind}
          >
            {block.centerLabel}
          </span>
        )}
        <div className="operator-spatial-points" role="list">
          {block.points.map((point) => {
            const position = positions.get(point.id);
            if (!position) return null;
            const details =
              "category" in point
                ? [point.category, ...(point.details ?? [])]
                : [
                    point.kind,
                    point.status,
                    ...(point.tags ?? []),
                    ...(point.details ?? []),
                  ];
            return (
              <button
                key={point.id}
                className="operator-spatial-point"
                type="button"
                role="listitem"
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                data-ui-spatial-point={point.id}
                data-ui-spatial-related={JSON.stringify(
                  "relatedIds" in point ? (point.relatedIds ?? []) : [],
                )}
                data-tone={point.tone ?? "neutral"}
                aria-pressed="false"
                aria-controls={`${block.id}-detail-${point.id}`}
                title={`${point.label}: ${details.join(", ")}`}
              >
                <span aria-hidden="true" />
                <span>{point.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <figcaption>
        <p className="operator-spatial-description">{block.description}</p>
        <ul className="operator-spatial-legend" aria-label="Legend">
          {block.legend.map((item, index) => (
            <li
              key={`${item.label}:${index}`}
              data-tone={item.tone ?? "neutral"}
            >
              {item.label}
            </li>
          ))}
        </ul>
        <div className="operator-spatial-details" aria-live="polite">
          {block.points.map((point) => (
            <article
              key={point.id}
              id={`${block.id}-detail-${point.id}`}
              data-ui-spatial-detail={point.id}
              hidden
            >
              <strong>{point.label}</strong>
              <span>
                {"category" in point
                  ? point.category
                  : `${point.kind} · ${point.status}`}
              </span>
            </article>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

function PanelBlock(props: {
  block: RuntimeCmsOperatorPanelBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  switch (props.block.type) {
    case "stats":
      return <StatsBlock block={props.block} />;
    case "key-values":
      return <KeyValuesBlock block={props.block} />;
    case "notice":
      return <NoticeBlock block={props.block} />;
    case "text":
      return <TextBlock block={props.block} />;
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

/**
 * Master/detail is rendered as two regions of one block: the collection keeps
 * its place while the open row's panels render beside it. Opening and closing
 * are canonical query changes, so the URL stays the source of truth and a
 * reload restores the same pair.
 */
function DetailBlock(props: {
  block: Extract<RuntimeCmsOperatorBlock, { type: "detail" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const { block, query, onQueryChange } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // What the query asks for, not what has arrived: the two differ while a
  // detail is loading, and a click must be answered immediately rather than
  // waiting on a round-trip that may be slow.
  const requestedRaw = query[block.queryKey];
  const requested =
    typeof requestedRaw === "string" && requestedRaw !== ""
      ? requestedRaw
      : undefined;
  const open = block.open?.forId === requested ? block.open : undefined;
  const pending = requested !== undefined && open === undefined;

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  const openItem = (itemId: string): void => {
    onQueryChange({ ...query, [block.queryKey]: itemId });
  };
  const closeItem = (): void => {
    const next = { ...query };
    delete next[block.queryKey];
    onQueryChange(next);
  };

  const master =
    block.master.type === "list" ? (
      <ListBlock
        block={block.master}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        openId={requested}
      />
    ) : (
      <TableBlock
        block={block.master}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        openId={requested}
      />
    );

  return (
    <div
      className="declarative-detail"
      data-open={requested === undefined ? "false" : "true"}
    >
      <section className="declarative-detail-master" aria-label="Items">
        <OpenDetailContext.Provider value={openItem}>
          {master}
        </OpenDetailContext.Provider>
      </section>
      {/* The reading pane exists only once something is asked for, so a
          collection at rest keeps the full measure. */}
      {requested !== undefined && (
        <section
          className="declarative-detail-pane"
          aria-label={open ? open.title : "Detail"}
        >
          {open ? (
            <>
              <button
                type="button"
                className="declarative-detail-back"
                onClick={closeItem}
              >
                ← Back
              </button>
              <h3 ref={headingRef} tabIndex={-1}>
                {open.title}
              </h3>
              {open.blocks.map((panel, index) => (
                <section
                  key={panel.id ?? `${panel.type}:${index}`}
                  data-block={panel.type}
                >
                  {panel.type === "card" ? (
                    <CardBlock
                      block={panel}
                      onAction={props.onAction}
                      onOpenEntity={props.onOpenEntity}
                      onLaunch={props.onLaunch}
                      query={query}
                      onQueryChange={onQueryChange}
                    />
                  ) : (
                    <PanelBlock
                      block={panel}
                      onAction={props.onAction}
                      onOpenEntity={props.onOpenEntity}
                      onLaunch={props.onLaunch}
                      query={query}
                      onQueryChange={onQueryChange}
                    />
                  )}
                </section>
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                className="declarative-detail-back"
                onClick={closeItem}
              >
                ← Back
              </button>
              <p className="declarative-empty" aria-live="polite">
                {pending ? "Loading…" : block.empty}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CardBlock(props: {
  block: Extract<RuntimeCmsOperatorBlock, { type: "card" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  return (
    <section
      className="declarative-card"
      data-tone={props.block.tone ?? "neutral"}
    >
      <header>{props.block.label}</header>
      {props.block.blocks.map((panel, index) => (
        <div key={panel.id ?? `${panel.type}:${index}`} data-block={panel.type}>
          <PanelBlock
            block={panel}
            onAction={props.onAction}
            onOpenEntity={props.onOpenEntity}
            onLaunch={props.onLaunch}
            query={props.query}
            onQueryChange={props.onQueryChange}
          />
        </div>
      ))}
    </section>
  );
}

/**
 * A column of work beside a rail of standing facts. Both regions hold panels
 * and cards; the host owns the ratio and the narrow-viewport stacking.
 */
function ColumnsBlock(props: {
  block: Extract<RuntimeCmsOperatorBlock, { type: "columns" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const region = (
    entries: readonly RuntimeCmsOperatorRegionBlock[],
    className: string,
  ): ReactElement => (
    <div className={className}>
      {entries.map((entry, index) => (
        <section
          key={entry.id ?? `${entry.type}:${index}`}
          data-block={entry.type}
        >
          {entry.type === "card" ? (
            <CardBlock
              block={entry}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              query={props.query}
              onQueryChange={props.onQueryChange}
            />
          ) : (
            <PanelBlock
              block={entry}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              query={props.query}
              onQueryChange={props.onQueryChange}
            />
          )}
        </section>
      ))}
    </div>
  );

  return (
    <div className="declarative-columns">
      {region(props.block.primary, "declarative-column")}
      {region(props.block.aside, "declarative-column declarative-aside")}
    </div>
  );
}

function ViewBlock(props: {
  block: RuntimeBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const [activeTab, setActiveTab] = useState(
    props.block.type === "tabs" ? props.block.defaultTab : "",
  );
  const host = useContext(OperatorRendererHostContext);
  if (props.block.type === "columns") {
    return (
      <ColumnsBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  if (props.block.type === "card") {
    return (
      <CardBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  if (props.block.type === "detail") {
    return (
      <DetailBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
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
  if (host.renderAllTabs) {
    return (
      <WidgetTabs
        id={`operator-${props.block.id}`}
        label={props.block.label}
        defaultValue={props.block.defaultTab}
        tabs={props.block.tabs.map((tab) => ({
          value: tab.id,
          label: tab.label,
          ...(tab.count !== undefined ? { count: tab.count } : {}),
          content: tab.blocks.map((block, index) => (
            <section
              className={`operator-block operator-block--${block.type}`}
              key={block.id ?? `${block.type}:${index}`}
            >
              <PanelBlock
                block={block}
                onAction={props.onAction}
                onOpenEntity={props.onOpenEntity}
                onLaunch={props.onLaunch}
                query={props.query}
                onQueryChange={props.onQueryChange}
              />
            </section>
          )),
        }))}
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

/**
 * Blocks that read as a narrow instrument panel share a row; everything that
 * carries a collection, a reading surface, or its own controls claims the full
 * measure. Authors declare meaning, so width stays a host decision.
 */
const COMPACT_BLOCKS: ReadonlySet<string> = new Set([
  "key-values",
  "group",
  "meters",
  "progress",
]);

function blockSpan(type: string): "compact" | "wide" {
  return COMPACT_BLOCKS.has(type) ? "compact" : "wide";
}

export interface OperatorViewRendererProps {
  data: RuntimeCmsWorkspaceData;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch?: ((launch: RuntimeOperatorLaunchIntent) => void) | undefined;
  query?: OperatorViewQuery | undefined;
  onQueryChange?: ((query: OperatorViewQuery) => void) | undefined;
  resolveLink?:
    ((target: RuntimeOperatorLinkTarget) => string | undefined) | undefined;
  renderAllTabs?: boolean | undefined;
}

export function OperatorViewRenderer(
  props: OperatorViewRendererProps,
): ReactElement {
  const { title, blocks } = props.data.view;
  // Leading stats are the workspace's totals, so they belong beside the title
  // rather than in the body as one more card.
  const [lead] = blocks;
  const totals =
    props.renderAllTabs !== true && lead?.type === "stats" ? lead : null;
  const bodyBlocks = totals ? blocks.slice(1) : blocks;
  const { kicker, description, status } = props.data.view;
  const hasHead =
    Boolean(title) ||
    Boolean(kicker) ||
    totals !== null ||
    status !== undefined;

  return (
    <OperatorRendererHostContext.Provider
      value={{
        resolveLink: props.resolveLink,
        renderAllTabs: props.renderAllTabs === true,
      }}
    >
      <main className="declarative-workspace operator-view">
        {hasHead && (
          <header className="declarative-head">
            <div className="declarative-head-copy">
              {kicker && <span className="declarative-kicker">{kicker}</span>}
              <h2 className="operator-view-title">{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <div className="declarative-head-state">
              {status && (
                <strong
                  className="declarative-status-badge"
                  data-tone={status.tone ?? "neutral"}
                >
                  {status.label}
                  {status.detail && <small>{status.detail}</small>}
                </strong>
              )}
              {totals && (
                <StatsBlock block={totals} className="declarative-totals" />
              )}
            </div>
          </header>
        )}
        <div className="declarative-blocks">
          {bodyBlocks.map((block, index) => (
            <section
              className={`operator-block operator-block--${block.type}`}
              key={block.id ?? `${block.type}:${index}`}
              data-block={block.type}
              data-span={blockSpan(block.type)}
            >
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
    </OperatorRendererHostContext.Provider>
  );
}
