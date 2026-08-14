/** @jsxImportSource preact */
import {
  safeParseRuntimeDashboardWidgetData,
  type RuntimeDashboardOperatorPanelBlock,
  type RuntimeDashboardOperatorView,
  type RuntimeOperatorLaunchIntent,
  type RuntimeOperatorLinkTarget,
  type RuntimeOperatorScalar,
} from "@brains/plugins";
import {
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetFilter,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
  WidgetTabs,
} from "@rizom/brain-ui";
import type { ComponentChildren, JSX } from "preact";
import type { RenderableWidgetData } from "./types";

type RuntimeBlock = RuntimeDashboardOperatorView["blocks"][number];
type RuntimeTone = "good" | "warn" | "neutral" | "error";

interface OperatorLaunchPaths {
  readonly accountPath?: string | undefined;
  readonly adminPath?: string | undefined;
  readonly cmsPath?: string | undefined;
}

function displayScalar(value: RuntimeOperatorScalar): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isStringArray(
  value: RuntimeOperatorScalar | readonly string[] | undefined,
): value is readonly string[] {
  return Array.isArray(value);
}

function displayTableValue(
  value: RuntimeOperatorScalar | readonly string[] | undefined,
): string {
  if (isStringArray(value)) return value.join(", ");
  return displayScalar(value ?? null);
}

function statusTone(
  tone: RuntimeTone | undefined,
): "plain" | "warn" | "error" | "ok" | "muted" {
  switch (tone) {
    case "good":
      return "ok";
    case "warn":
      return "warn";
    case "error":
      return "error";
    case "neutral":
      return "muted";
    default:
      return "plain";
  }
}

function entityHref(basePath: string, entityType: string, id: string): string {
  const base = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  return `${base}/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`;
}

function workspaceHref(cmsPath: string, workspaceId: string): string {
  const base = cmsPath === "/" ? "" : cmsPath.replace(/\/+$/, "");
  return `${base}/workspaces/${encodeURIComponent(workspaceId)}`;
}

function inboxLaunchHref(
  cmsPath: string,
  launch: Extract<RuntimeOperatorLaunchIntent, { target: "inbox" }>,
): string {
  const url = new URL(
    workspaceHref(cmsPath, "unified-inbox:inbox"),
    "https://brains.invalid",
  );
  if ("source" in launch) {
    url.searchParams.set("sourceId", "mail-items");
    if (launch.filter === "high-priority") {
      url.searchParams.set("facet.mail-priority", "high");
    } else if (launch.filter === "needs-reply") {
      url.searchParams.set("facet.needs-reply", "true");
    } else if (launch.filter === "unclassified") {
      url.searchParams.set("facet.category", "unclassified");
    }
  }
  return `${url.pathname}${url.search}`;
}

function launchHref(
  launch: RuntimeOperatorLaunchIntent,
  paths: OperatorLaunchPaths,
): string | undefined {
  if (launch.target === "account-settings") return paths.accountPath;
  if (launch.target === "admin-peer-invite") {
    if (!paths.adminPath) return undefined;
    const url = new URL(paths.adminPath, "https://brains.invalid");
    url.searchParams.set("peerId", launch.peerId);
    url.searchParams.set("displayName", launch.displayName);
    return `${url.pathname}${url.search}`;
  }
  if (!paths.cmsPath) return undefined;
  switch (launch.target) {
    case "inbox":
      return inboxLaunchHref(paths.cmsPath, launch);
    case "publishing":
      return workspaceHref(paths.cmsPath, "content-pipeline:publishing");
    case "site":
      return workspaceHref(paths.cmsPath, "site-builder:site");
    case "inbox-open-entity":
    case "inbox-open-detail":
    case "inbox-discuss-in-chat":
    case "inbox-capture-note":
      return undefined;
  }
}

function resolveLink(
  target: RuntimeOperatorLinkTarget | undefined,
  paths: OperatorLaunchPaths,
): { href: string; external: boolean } | undefined {
  if (!target) return undefined;
  if (target.kind === "external") {
    return { href: target.href, external: true };
  }
  if (target.kind === "launch") {
    const href = launchHref(target.launch, paths);
    return href ? { href, external: false } : undefined;
  }
  return paths.cmsPath
    ? {
        href: entityHref(paths.cmsPath, target.entityType, target.id),
        external: false,
      }
    : undefined;
}

function LinkedText({
  children,
  target,
  launchPaths,
}: {
  children: ComponentChildren;
  target: RuntimeOperatorLinkTarget | undefined;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  const link = resolveLink(target, launchPaths);
  return link ? (
    <a
      class="operator-inline-link"
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

function StatsBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "stats" }>;
}): JSX.Element {
  return (
    <dl class="operator-stats">
      {block.items.map((item, index) => (
        <div class="operator-stat" key={`${item.label}:${index}`}>
          <dt>{item.label}</dt>
          <dd>
            <span>{item.value}</span>
            {item.tone && (
              <WidgetStatusPill tone={statusTone(item.tone)}>
                {item.tone}
              </WidgetStatusPill>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function KeyValuesBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "key-values" }>;
}): JSX.Element {
  return (
    <KeyValueList
      items={block.items.map((item) => ({
        label: item.label,
        value: displayScalar(item.value),
      }))}
    />
  );
}

function NoticeBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "notice" }>;
}): JSX.Element {
  return (
    <aside
      class={`operator-notice operator-notice--${block.tone ?? "neutral"}`}
    >
      {block.title && <strong>{block.title}</strong>}
      <p>{block.text}</p>
    </aside>
  );
}

function LinksBlock({
  block,
  launchPaths,
}: {
  block: Extract<RuntimeBlock, { type: "links" }>;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  const links = block.items
    .map((item) => ({ item, link: resolveLink(item.target, launchPaths) }))
    .filter(
      (
        entry,
      ): entry is typeof entry & { link: NonNullable<typeof entry.link> } =>
        entry.link !== undefined,
    );
  return links.length > 0 ? (
    <WidgetActions label="Widget links">
      {links.map(({ item, link }, index) => (
        <WidgetActionLink
          key={`${item.label}:${index}`}
          href={link.href}
          external={link.external}
        >
          {item.label}
        </WidgetActionLink>
      ))}
    </WidgetActions>
  ) : (
    <p class="operator-empty">No available links.</p>
  );
}

type RuntimeListItem = Extract<
  RuntimeDashboardOperatorPanelBlock,
  { type: "list" }
>["items"][number];

function ListItem({
  item,
  launchPaths,
}: {
  item: RuntimeListItem;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  const metadata = [
    ...(item.meta ? [item.meta] : []),
    ...(item.metadata ?? []),
  ];
  const badges = item.badges ?? [];
  const links = (item.links ?? []).flatMap((link) => {
    const resolved = resolveLink(link.target, launchPaths);
    return resolved ? [{ label: link.label, ...resolved }] : [];
  });
  const hasTrailing =
    item.count !== undefined ||
    badges.length > 0 ||
    item.tone !== undefined ||
    links.length > 0;
  return (
    <WidgetListItem
      title={
        <LinkedText target={item.link} launchPaths={launchPaths}>
          {item.title}
        </LinkedText>
      }
      description={item.description}
      meta={[...metadata]}
      tags={[...(item.tags ?? [])]}
      filterValues={item.filterValues ? [...item.filterValues] : undefined}
      trailing={
        hasTrailing ? (
          <>
            {item.count !== undefined && (
              <span class="list-count">{item.count}</span>
            )}
            {badges.map((badge, index) => (
              <WidgetStatusPill
                key={`${badge.label}:${index}`}
                tone={statusTone(badge.tone)}
              >
                {badge.label}
              </WidgetStatusPill>
            ))}
            {badges.length === 0 && item.tone && (
              <WidgetStatusPill tone={statusTone(item.tone)}>
                {item.tone}
              </WidgetStatusPill>
            )}
            {links.map((link, index) => (
              <WidgetActionLink
                key={`${link.label}:${index}`}
                href={link.href}
                external={link.external}
              >
                {link.label}
              </WidgetActionLink>
            ))}
          </>
        ) : undefined
      }
    />
  );
}

function ListBlock({
  block,
  launchPaths,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "list" }>;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  if (block.items.length === 0) {
    return <p class="operator-empty">{block.empty}</p>;
  }
  const list = (
    <WidgetList>
      {block.items.map((item) => (
        <ListItem key={item.id} item={item} launchPaths={launchPaths} />
      ))}
    </WidgetList>
  );
  if (!block.filter) return list;
  return (
    <WidgetFilter
      label={block.filter.label}
      defaultValue={block.filter.defaultValue}
      {...(block.filter.allValue ? { allValue: block.filter.allValue } : {})}
      options={block.filter.options.map((option) => ({
        value: option.value,
        label: option.label,
        ...(option.count !== undefined ? { count: option.count } : {}),
        ...(option.emphasis ? { tone: option.emphasis } : {}),
      }))}
      emptyState={<p class="operator-empty">{block.empty}</p>}
    >
      {list}
    </WidgetFilter>
  );
}

function TableBlock({
  block,
  launchPaths,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "table" }>;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  if (block.rows.length === 0) {
    return <p class="operator-empty">{block.empty}</p>;
  }
  return (
    <div class="operator-table-scroll">
      {block.filters && block.filters.length > 0 && (
        <div class="operator-filter-summary" aria-label="Available filters">
          {block.filters.map((filter) => (
            <span key={filter.key}>
              {filter.label}: {filter.values.map(displayScalar).join(", ")}
            </span>
          ))}
        </div>
      )}
      <table class="operator-table">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th
                class={`operator-align--${column.align ?? "start"}`}
                key={column.key}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.id}>
              {block.columns.map((column, columnIndex) => {
                const rendered = displayTableValue(row.cells[column.key]);
                return (
                  <td
                    class={`operator-align--${column.align ?? "start"}`}
                    key={column.key}
                  >
                    {columnIndex === 0 ? (
                      <LinkedText target={row.link} launchPaths={launchPaths}>
                        {rendered}
                      </LinkedText>
                    ) : (
                      rendered
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupBlock({
  block,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "group" }>;
}): JSX.Element {
  return (
    <section class="operator-group" aria-labelledby={`${block.id}-title`}>
      <h5 id={`${block.id}-title`}>{block.label}</h5>
      <dl>
        {block.items.map((item) => (
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

function FlowBlock({
  block,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "flow" }>;
}): JSX.Element {
  return (
    <section class="operator-flow" aria-labelledby={`${block.id}-title`}>
      <h5 id={`${block.id}-title`}>{block.label}</h5>
      <ol data-direction={block.direction ?? "forward"}>
        {block.steps.map((step) => (
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

function MetersBlock({
  block,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "meters" }>;
}): JSX.Element {
  return (
    <dl class="operator-meters">
      {block.items.map((item) => (
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

function ProgressBlock({
  block,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "progress" }>;
}): JSX.Element {
  return (
    <section class="operator-progress" data-tone={block.tone ?? "neutral"}>
      <header>
        <strong>{block.label}</strong>
        <span>{block.state}</span>
      </header>
      {block.progress !== undefined && (
        <progress value={block.progress} max="1">
          {Math.round(block.progress * 100)}%
        </progress>
      )}
      {block.detail && <p>{block.detail}</p>}
      {(block.startedAt ?? block.updatedAt) && (
        <small>
          {block.startedAt ? `Started ${block.startedAt}` : ""}
          {block.startedAt && block.updatedAt ? " · " : ""}
          {block.updatedAt ? `Updated ${block.updatedAt}` : ""}
        </small>
      )}
    </section>
  );
}

function MatrixBlock({
  block,
  launchPaths,
}: {
  block: Extract<RuntimeDashboardOperatorPanelBlock, { type: "matrix" }>;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  return (
    <div
      class="operator-matrix"
      style={`--operator-matrix-columns: ${block.columns ?? 2}`}
    >
      {block.cells.map((cell) => (
        <section
          key={cell.id}
          class="operator-matrix-cell"
          data-tone={cell.tone ?? "neutral"}
          aria-labelledby={`${block.id}-${cell.id}-title`}
        >
          <h5 id={`${block.id}-${cell.id}-title`}>{cell.label}</h5>
          {cell.items.length === 0 ? (
            <p class="operator-empty">{cell.empty}</p>
          ) : (
            <WidgetList>
              {cell.items.map((item) => (
                <ListItem key={item.id} item={item} launchPaths={launchPaths} />
              ))}
            </WidgetList>
          )}
        </section>
      ))}
    </div>
  );
}

type RuntimeSpatialBlock = Extract<
  RuntimeDashboardOperatorPanelBlock,
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

function SpatialBlock({ block }: { block: RuntimeSpatialBlock }): JSX.Element {
  const positions = spatialPositions(block);
  return (
    <figure
      class={`operator-spatial operator-spatial--${block.layout}`}
      data-ui-spatial
      aria-label={block.label}
    >
      <div class="operator-spatial-canvas">
        <svg
          class="operator-spatial-lines"
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
                class="operator-spatial-zone"
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
          <span class="operator-spatial-center" data-kind={block.centerKind}>
            {block.centerLabel}
          </span>
        )}
        <div class="operator-spatial-points" role="list">
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
                class="operator-spatial-point"
                type="button"
                role="listitem"
                style={`left:${position.x}%;top:${position.y}%`}
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
        <p class="operator-spatial-description">{block.description}</p>
        <ul class="operator-spatial-legend" aria-label="Legend">
          {block.legend.map((item, index) => (
            <li
              key={`${item.label}:${index}`}
              data-tone={item.tone ?? "neutral"}
            >
              {item.label}
            </li>
          ))}
        </ul>
        <div class="operator-spatial-details" aria-live="polite">
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

function PanelBlock({
  block,
  launchPaths,
}: {
  block: RuntimeDashboardOperatorPanelBlock;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  switch (block.type) {
    case "stats":
      return <StatsBlock block={block} />;
    case "key-values":
      return <KeyValuesBlock block={block} />;
    case "notice":
      return <NoticeBlock block={block} />;
    case "group":
      return <GroupBlock block={block} />;
    case "flow":
      return <FlowBlock block={block} />;
    case "meters":
      return <MetersBlock block={block} />;
    case "progress":
      return <ProgressBlock block={block} />;
    case "links":
      return <LinksBlock block={block} launchPaths={launchPaths} />;
    case "list":
      return <ListBlock block={block} launchPaths={launchPaths} />;
    case "table":
      return <TableBlock block={block} launchPaths={launchPaths} />;
    case "matrix":
      return <MatrixBlock block={block} launchPaths={launchPaths} />;
    case "spatial":
      return <SpatialBlock block={block} />;
  }
}

function ViewBlock({
  block,
  launchPaths,
  scopeId,
}: {
  block: RuntimeBlock;
  launchPaths: OperatorLaunchPaths;
  scopeId: string;
}): JSX.Element {
  if (block.type !== "tabs") {
    return <PanelBlock block={block} launchPaths={launchPaths} />;
  }
  return (
    <WidgetTabs
      id={`${scopeId}-${block.id}`}
      label={block.label}
      defaultValue={block.defaultTab}
      tabs={block.tabs.map((tab) => ({
        value: tab.id,
        label: tab.label,
        ...(tab.count !== undefined ? { count: tab.count } : {}),
        content: tab.blocks.map((panelBlock, index) => (
          <section
            class={`operator-block operator-block--${panelBlock.type}`}
            key={panelBlock.id ?? `${panelBlock.type}:${index}`}
          >
            <PanelBlock block={panelBlock} launchPaths={launchPaths} />
          </section>
        )),
      }))}
    />
  );
}

export function DeclarativeWidgetBody({
  widget,
  launchPaths,
}: {
  widget: RenderableWidgetData;
  launchPaths: OperatorLaunchPaths;
}): JSX.Element {
  const parsed = safeParseRuntimeDashboardWidgetData(widget.data);
  if (!parsed.success) {
    return <p class="operator-empty">Widget data is unavailable.</p>;
  }
  const { view } = parsed.data;
  const scopeId = `operator-${widget.widget.pluginId}-${widget.widget.id}`;
  return (
    <div class="operator-view">
      {view.title && <h4 class="operator-view-title">{view.title}</h4>}
      {view.blocks.length === 0 ? (
        <p class="operator-empty">No widget details.</p>
      ) : (
        view.blocks.map((block, index) => (
          <section
            class={`operator-block operator-block--${block.type}`}
            key={block.id ?? `${block.type}:${index}`}
          >
            <ViewBlock
              block={block}
              launchPaths={launchPaths}
              scopeId={scopeId}
            />
          </section>
        ))
      )}
    </div>
  );
}
