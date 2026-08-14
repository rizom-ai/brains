/** @jsxImportSource preact */
import {
  safeParseRuntimeDashboardWidgetData,
  type RuntimeDashboardOperatorView,
  type RuntimeOperatorLinkTarget,
  type RuntimeOperatorScalar,
} from "@brains/plugins";
import {
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
} from "@brains/ui-library";
import type { ComponentChildren, JSX } from "preact";
import type { RenderableWidgetData } from "./types";

type RuntimeBlock = RuntimeDashboardOperatorView["blocks"][number];
type RuntimeTone = "good" | "warn" | "neutral" | "error";

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

function resolveLink(
  target: RuntimeOperatorLinkTarget | undefined,
  cmsPath: string | undefined,
): { href: string; external: boolean } | undefined {
  if (!target) return undefined;
  if (target.kind === "external") {
    return { href: target.href, external: true };
  }
  return cmsPath
    ? {
        href: entityHref(cmsPath, target.entityType, target.id),
        external: false,
      }
    : undefined;
}

function LinkedText({
  children,
  target,
  cmsPath,
}: {
  children: ComponentChildren;
  target: RuntimeOperatorLinkTarget | undefined;
  cmsPath: string | undefined;
}): JSX.Element {
  const link = resolveLink(target, cmsPath);
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
  cmsPath,
}: {
  block: Extract<RuntimeBlock, { type: "links" }>;
  cmsPath: string | undefined;
}): JSX.Element {
  const links = block.items
    .map((item) => ({ item, link: resolveLink(item.target, cmsPath) }))
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

function ListBlock({
  block,
  cmsPath,
}: {
  block: Extract<RuntimeBlock, { type: "list" }>;
  cmsPath: string | undefined;
}): JSX.Element {
  if (block.items.length === 0) {
    return <p class="operator-empty">{block.empty}</p>;
  }
  return (
    <WidgetList>
      {block.items.map((item) => (
        <WidgetListItem
          key={item.id}
          title={
            <LinkedText target={item.link} cmsPath={cmsPath}>
              {item.title}
            </LinkedText>
          }
          description={item.description}
          meta={item.meta ? [item.meta] : []}
          trailing={
            item.tone ? (
              <WidgetStatusPill tone={statusTone(item.tone)}>
                {item.tone}
              </WidgetStatusPill>
            ) : undefined
          }
        />
      ))}
    </WidgetList>
  );
}

function TableBlock({
  block,
  cmsPath,
}: {
  block: Extract<RuntimeBlock, { type: "table" }>;
  cmsPath: string | undefined;
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
                      <LinkedText target={row.link} cmsPath={cmsPath}>
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

function ViewBlock({
  block,
  cmsPath,
}: {
  block: RuntimeBlock;
  cmsPath: string | undefined;
}): JSX.Element {
  switch (block.type) {
    case "stats":
      return <StatsBlock block={block} />;
    case "key-values":
      return <KeyValuesBlock block={block} />;
    case "notice":
      return <NoticeBlock block={block} />;
    case "links":
      return <LinksBlock block={block} cmsPath={cmsPath} />;
    case "list":
      return <ListBlock block={block} cmsPath={cmsPath} />;
    case "table":
      return <TableBlock block={block} cmsPath={cmsPath} />;
  }
}

export function DeclarativeWidgetBody({
  widget,
  cmsPath,
}: {
  widget: RenderableWidgetData;
  cmsPath: string | undefined;
}): JSX.Element {
  const parsed = safeParseRuntimeDashboardWidgetData(widget.data);
  if (!parsed.success) {
    return <p class="operator-empty">Widget data is unavailable.</p>;
  }
  const { view } = parsed.data;
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
            <ViewBlock block={block} cmsPath={cmsPath} />
          </section>
        ))
      )}
    </div>
  );
}
