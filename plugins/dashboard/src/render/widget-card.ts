import { escapeHtml, formatLabel } from "@brains/utils";
import type { WidgetData } from "../widget-schema";

const KV_SKIP_KEYS = new Set(["rendered", "version"]);
const PIPELINE_STATUSES = ["draft", "queued", "published", "failed"] as const;

type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// ─── Generic kv fallback ──────────────────────────────────────────────

function renderKvRows(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(
    ([key, value]) => !KV_SKIP_KEYS.has(key) && !isEmptyValue(value),
  );
  if (entries.length === 0) return "";
  return `<dl class="kv">${entries
    .map(([key, value]) => {
      const display =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return `<div class="kv-row"><dt>${escapeHtml(
        formatLabel(key),
      )}</dt><dd>${escapeHtml(display)}</dd></div>`;
    })
    .join("")}</dl>`;
}

// ─── ListWidget ───────────────────────────────────────────────────────
// Consumed by plugins that emit `{ items: [{ id, name, ... }] }`.
// Fields are optional — the renderer shows whichever are present.

interface ListItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  count?: number;
  priority?: string;
  status?: string;
}

const PRIO_CLASS: Record<string, string> = {
  crit: "pill--err",
  critical: "pill--err",
  high: "pill--warn",
  med: "",
  medium: "",
  low: "pill--mute",
};

function renderListItem(item: ListItem): string {
  const tags =
    item.tags && item.tags.length > 0
      ? `<div class="list-tags">${item.tags
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("")}</div>`
      : "";
  const desc = item.description
    ? `<span class="list-desc">${escapeHtml(item.description)}</span>`
    : "";
  const prio = item.priority
    ? `<span class="pill ${PRIO_CLASS[item.priority.toLowerCase()] ?? ""}">${escapeHtml(
        item.priority,
      )}</span>`
    : "";
  const status = item.status
    ? `<span class="pill pill--ok">${escapeHtml(item.status)}</span>`
    : "";
  const count =
    typeof item.count === "number"
      ? `<span class="list-count">${escapeHtml(item.count)}</span>`
      : "";

  return `<li class="list-item">
    <div class="list-main">
      <span class="list-name">${escapeHtml(item.name)}</span>
      ${desc}
      ${tags}
    </div>
    <div class="list-meta">${count}${prio}${status}</div>
  </li>`;
}

function renderListBody(data: unknown): string {
  if (typeof data !== "object" || data === null || !("items" in data)) {
    return '<p class="muted">Nothing to show yet.</p>';
  }
  const raw = (data as { items: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) {
    return '<p class="muted">Nothing to show yet.</p>';
  }
  const items = raw.filter(
    (v): v is ListItem =>
      typeof v === "object" &&
      v !== null &&
      "id" in v &&
      "name" in v &&
      typeof (v as { id: unknown }).id === "string" &&
      typeof (v as { name: unknown }).name === "string",
  );
  if (items.length === 0) return '<p class="muted">Nothing to show yet.</p>';
  return `<ul class="list">${items.map(renderListItem).join("")}</ul>`;
}

// ─── PipelineWidget ───────────────────────────────────────────────────

interface PipelineItem {
  id: string;
  title: string;
  type: string;
  status: PipelineStatus;
  scheduledFor?: string;
  retryInfo?: string;
}

function isPipelineStatus(value: unknown): value is PipelineStatus {
  return (
    typeof value === "string" &&
    PIPELINE_STATUSES.includes(value as PipelineStatus)
  );
}

function pipelineStatusLabel(status: PipelineStatus): string {
  switch (status) {
    case "draft":
      return "drafts";
    case "queued":
      return "queued";
    case "published":
      return "published";
    case "failed":
      return "failed";
  }
}

function renderPipelineBody(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">Nothing to show yet.</p>';
  }

  const summaryRaw =
    "summary" in data ? (data as { summary?: unknown }).summary : undefined;
  const itemsRaw =
    "items" in data ? (data as { items?: unknown }).items : undefined;

  if (
    typeof summaryRaw !== "object" ||
    summaryRaw === null ||
    !Array.isArray(itemsRaw)
  ) {
    return '<p class="muted">Nothing to show yet.</p>';
  }

  const summary = {
    draft:
      typeof (summaryRaw as { draft?: unknown }).draft === "number"
        ? (summaryRaw as { draft: number }).draft
        : 0,
    queued:
      typeof (summaryRaw as { queued?: unknown }).queued === "number"
        ? (summaryRaw as { queued: number }).queued
        : 0,
    published:
      typeof (summaryRaw as { published?: unknown }).published === "number"
        ? (summaryRaw as { published: number }).published
        : 0,
    failed:
      typeof (summaryRaw as { failed?: unknown }).failed === "number"
        ? (summaryRaw as { failed: number }).failed
        : 0,
  };

  const items = itemsRaw.filter(
    (item): item is PipelineItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { title?: unknown }).title === "string" &&
      typeof (item as { type?: unknown }).type === "string" &&
      isPipelineStatus((item as { status?: unknown }).status),
  );

  const summaryHtml = PIPELINE_STATUSES.map(
    (status) => `<div class="pipeline-summary-item">
      <span class="pipeline-dot pipeline-dot--${status}"></span>
      <span class="pipeline-summary-count">${escapeHtml(summary[status])}</span>
      <span class="pipeline-summary-label">${escapeHtml(pipelineStatusLabel(status))}</span>
    </div>`,
  ).join("");

  if (items.length === 0) {
    return `<div class="pipeline-summary">${summaryHtml}</div>
      <p class="muted">No pipeline items yet.</p>`;
  }

  const itemRows = items
    .map((item) => {
      const meta = item.retryInfo ?? item.scheduledFor ?? item.status;
      return `<div class="pipeline-item">
        <span class="pipeline-dot pipeline-dot--${escapeHtml(item.status)}"></span>
        <span class="pipeline-name">${escapeHtml(item.title)}</span>
        <span class="pipeline-type">${escapeHtml(item.type)}</span>
        <span class="pipeline-when${item.status === "failed" ? " pipeline-when--err" : ""}">${escapeHtml(meta)}</span>
      </div>`;
    })
    .join("");

  return `<div class="pipeline-summary">${summaryHtml}</div>
    <div class="pipeline-list">${itemRows}</div>`;
}

// ─── Dispatch ─────────────────────────────────────────────────────────

function renderBody(widget: WidgetData): string {
  const data = widget.data;
  if (widget.widget.rendererName === "PipelineWidget") {
    return renderPipelineBody(data);
  }
  if (widget.widget.rendererName === "ListWidget") {
    return renderListBody(data);
  }
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">Nothing to show yet.</p>';
  }
  const kv = renderKvRows(data as Record<string, unknown>);
  return kv || '<p class="muted">Nothing to show yet.</p>';
}

function maybeCountChip(widget: WidgetData): string {
  if (widget.widget.rendererName !== "ListWidget") return "";
  const data = widget.data;
  if (typeof data !== "object" || data === null || !("items" in data)) {
    return "";
  }
  const items = (data as { items: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return "";
  return `<span class="chip">${items.length}</span>`;
}

export function renderWidgetCard(widget: WidgetData, hero: boolean): string {
  const cls = hero ? "card card--hero" : "card";
  return `<article class="${cls}">
    <div class="card-head">
      <span class="card-title">${escapeHtml(widget.widget.title)}</span>
      ${maybeCountChip(widget)}
    </div>
    ${renderBody(widget)}
  </article>`;
}
