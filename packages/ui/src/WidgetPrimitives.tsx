/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from "preact";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface WidgetDataAttributes {
  [key: `data-${string}`]: string | number | boolean | undefined;
}

export type WidgetElementProps<T extends HTMLElement> = JSX.HTMLAttributes<T> &
  WidgetDataAttributes;

export function createWidgetInstanceId(
  pluginId: string,
  widgetId: string,
): string {
  const slug = `${pluginId}-${widgetId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `widget-${slug || "custom"}`;
}

export function CardHeader({
  title,
  source,
  subtitle,
  children,
}: {
  title: ComponentChildren;
  source?: ComponentChildren;
  subtitle?: ComponentChildren;
  children?: ComponentChildren;
}): JSX.Element {
  const detail = source ? (
    <span class="card-from">{source}</span>
  ) : subtitle ? (
    <span class="card-subtitle">{subtitle}</span>
  ) : (
    children
  );

  return (
    <div class="card-head">
      <span class="card-title">{title}</span>
      {detail}
    </div>
  );
}

export interface KeyValueItem {
  label: ComponentChildren;
  value: ComponentChildren;
}

export function KeyValueList({
  items,
}: {
  items: KeyValueItem[];
}): JSX.Element {
  return (
    <dl class="kv">
      {items.map((item, index) => (
        <div class="kv-row" key={index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WidgetEmptyState({
  children = "Nothing to show yet.",
  className,
}: {
  children?: ComponentChildren;
  className?: string;
}): JSX.Element {
  return <p class={classes("muted", className)}>{children}</p>;
}

export const EmptyState: typeof WidgetEmptyState = WidgetEmptyState;

export function WidgetActions({
  label,
  children,
  className,
}: {
  label: string;
  children: ComponentChildren;
  className?: string;
}): JSX.Element {
  return (
    <nav class={classes("widget-actions", className)} aria-label={label}>
      {children}
    </nav>
  );
}

export function WidgetActionLink({
  href,
  children,
  external = false,
  emphasis = "secondary",
}: {
  href: string;
  children: ComponentChildren;
  external?: boolean;
  emphasis?: "primary" | "secondary";
}): JSX.Element {
  return (
    <a
      class={classes("widget-action", `widget-action--${emphasis}`)}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span>{children}</span>
      <span class="widget-action-arrow" aria-hidden="true">
        {external ? "↗" : "→"}
      </span>
    </a>
  );
}

export interface WidgetTabDefinition {
  value: string;
  label: ComponentChildren;
  count?: number | undefined;
  content: ComponentChildren;
  panelClassName?: string | undefined;
  triggerProps?: WidgetElementProps<HTMLButtonElement> | undefined;
  panelProps?: WidgetElementProps<HTMLDivElement> | undefined;
}

export function WidgetTabs({
  id,
  label,
  defaultValue,
  tabs,
  variant = "line",
  compact = false,
  stateAttribute,
  rootClassName,
  rootProps,
}: {
  id: string;
  label: string;
  defaultValue: string;
  tabs: WidgetTabDefinition[];
  variant?: "line" | "pill";
  compact?: boolean;
  stateAttribute?: string;
  rootClassName?: string;
  rootProps?: WidgetElementProps<HTMLDivElement> | undefined;
}): JSX.Element {
  const listClass =
    variant === "line"
      ? "widget-tabs"
      : classes("widget-filter-tabs", compact && "widget-filter-tabs--compact");
  const triggerClass = variant === "line" ? "widget-tab" : "widget-filter-tab";
  const countClass =
    variant === "line" ? "widget-tab-count" : "widget-filter-count";
  const labelClass = variant === "pill" ? "widget-filter-label" : undefined;

  return (
    <div
      {...rootProps}
      class={rootClassName}
      data-ui-tabs
      data-ui-tabs-default={defaultValue}
      {...(stateAttribute
        ? { "data-ui-tabs-state-attribute": stateAttribute }
        : {})}
    >
      <div class={listClass} role="tablist" aria-label={label}>
        {tabs.map((tab) => {
          const active = tab.value === defaultValue;
          const triggerId = `${id}-tab-${tab.value}`;
          const panelId = `${id}-panel-${tab.value}`;
          return (
            <button
              {...tab.triggerProps}
              id={triggerId}
              key={tab.value}
              class={classes(triggerClass, active && "is-active")}
              type="button"
              role="tab"
              data-ui-tab={tab.value}
              aria-controls={panelId}
              aria-selected={active ? "true" : "false"}
            >
              {variant === "pill" ? (
                <>
                  {tab.count !== undefined && (
                    <span class={countClass}>{tab.count}</span>
                  )}
                  <span class={labelClass}>{tab.label}</span>
                </>
              ) : (
                <>
                  {tab.label}
                  {tab.count !== undefined && (
                    <span class={countClass}>{tab.count}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const active = tab.value === defaultValue;
        return (
          <div
            {...tab.panelProps}
            id={`${id}-panel-${tab.value}`}
            key={tab.value}
            class={classes(tab.panelClassName, active && "is-active")}
            data-ui-panel={tab.value}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${tab.value}`}
            hidden={!active}
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}

export interface WidgetFilterOption {
  value: string;
  label: ComponentChildren;
  count?: number | undefined;
  tone?: "plain" | "gap" | undefined;
  triggerProps?: WidgetElementProps<HTMLButtonElement> | undefined;
}

export function WidgetFilter({
  label,
  defaultValue,
  options,
  children,
  emptyState,
  className,
  allValue = "all",
}: {
  label: string;
  defaultValue: string;
  options: WidgetFilterOption[];
  children: ComponentChildren;
  emptyState?: ComponentChildren;
  className?: string;
  allValue?: string;
}): JSX.Element {
  return (
    <div
      class={className}
      data-ui-filter
      data-ui-filter-default={defaultValue}
      data-ui-filter-all={allValue}
    >
      <div
        class="widget-filter-tabs widget-filter-tabs--compact"
        aria-label={label}
      >
        {options.map((option) => {
          const active = option.value === defaultValue;
          return (
            <button
              {...option.triggerProps}
              key={option.value}
              class={classes(
                "widget-filter-tab",
                active && "is-active",
                option.tone === "gap" && "is-gap",
              )}
              type="button"
              data-ui-filter-value={option.value}
              aria-pressed={active ? "true" : "false"}
            >
              {option.count !== undefined && (
                <span class="widget-filter-count">{option.count}</span>
              )}
              <span class="widget-filter-label">{option.label}</span>
            </button>
          );
        })}
      </div>
      {children}
      {emptyState !== undefined && (
        <div data-ui-filter-empty hidden>
          {emptyState}
        </div>
      )}
    </div>
  );
}

export function WidgetList({
  children,
  className,
}: {
  children: ComponentChildren;
  className?: string;
}): JSX.Element {
  return <ul class={classes("list", className)}>{children}</ul>;
}

export function WidgetMetaLine({
  segments,
}: {
  segments: string[];
}): JSX.Element | null {
  if (segments.length === 0) return null;

  return (
    <span class="list-meta-text">
      {segments.map((segment, index) => (
        <span key={`${segment}:${index}`}>
          {index > 0 && <span class="sep">·</span>}
          {segment}
        </span>
      ))}
    </span>
  );
}

export function WidgetTags({ tags }: { tags: string[] }): JSX.Element | null {
  if (tags.length === 0) return null;

  return (
    <div class="list-tags">
      {tags.map((tag, index) => (
        <span key={`${tag}:${index}`} class="tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function WidgetStatusPill({
  children,
  tone = "plain",
}: {
  children: ComponentChildren;
  tone?: "plain" | "warn" | "error" | "ok" | "muted";
}): JSX.Element {
  const toneClass = {
    plain: "",
    warn: "pill--warn",
    error: "pill--err",
    ok: "pill--ok",
    muted: "pill--mute",
  }[tone];

  return <span class={classes("pill", toneClass)}>{children}</span>;
}

export function WidgetListItem({
  title,
  description,
  meta = [],
  tags = [],
  trailing,
  filterValues,
  className,
  itemProps,
}: {
  title: ComponentChildren;
  description?: ComponentChildren | undefined;
  meta?: string[] | undefined;
  tags?: string[] | undefined;
  trailing?: ComponentChildren | undefined;
  filterValues?: string[] | undefined;
  className?: string | undefined;
  itemProps?: WidgetElementProps<HTMLLIElement> | undefined;
}): JSX.Element {
  return (
    <li
      {...itemProps}
      class={classes("list-item", className)}
      {...(filterValues
        ? { "data-ui-filter-values": JSON.stringify(filterValues) }
        : {})}
    >
      <div class="list-main">
        <span class="list-name">{title}</span>
        {description && <span class="list-desc">{description}</span>}
        <WidgetMetaLine segments={meta} />
        <WidgetTags tags={tags} />
      </div>
      {trailing && <div class="list-meta">{trailing}</div>}
    </li>
  );
}
