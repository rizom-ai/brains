import { escapeHtml, formatLabel } from "@brains/utils";
import type { WidgetData } from "../widget-schema";

const KV_SKIP_KEYS = new Set(["rendered", "version"]);

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

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

/**
 * Generic renderer for external plugin-contributed widgets.
 * Specific renderers (PipelineWidget, ListWidget) can supersede this
 * later; today the generic kv layout is sufficient for what plugins
 * contribute.
 */
export function renderWidgetCard(widget: WidgetData, hero: boolean): string {
  const cls = hero ? "card card--hero" : "card";
  const body = (() => {
    if (typeof widget.data !== "object" || widget.data === null) {
      return '<p class="muted">Nothing to show yet.</p>';
    }
    const kv = renderKvRows(widget.data as Record<string, unknown>);
    return kv || '<p class="muted">Nothing to show yet.</p>';
  })();
  return `<article class="${cls}">
    <div class="card-head">
      <span class="card-title">${escapeHtml(widget.widget.title)}</span>
    </div>
    ${body}
  </article>`;
}
