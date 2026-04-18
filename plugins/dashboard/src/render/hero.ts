import { escapeHtml, formatLabel } from "@brains/utils";
import type { EntityCount } from "./types";

export function renderHero(total: number, entityCounts: EntityCount[]): string {
  if (entityCounts.length === 0) {
    return `<article class="card card--hero">
      <div class="card-head">
        <span class="card-title">Entities</span>
      </div>
      <p class="muted">No indexed entities yet.</p>
    </article>`;
  }

  const sorted = [...entityCounts].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 1;
  const breakdown = sorted
    .map(({ entityType, count }) => {
      const width = Math.max(4, Math.round((count / max) * 100));
      return `<div class="breakdown-row">
        <span class="breakdown-name">${escapeHtml(formatLabel(entityType))}</span>
        <span class="breakdown-count">${escapeHtml(count)}</span>
        <div class="breakdown-bar"><i style="width:${width}%"></i></div>
      </div>`;
    })
    .join("");

  return `<article class="card card--hero">
    <div class="card-head">
      <span class="card-title">Entities</span>
      <span class="card-subtitle">corpus · sorted by volume</span>
    </div>
    <div class="entities">
      <div>
        <div class="hero-number">${escapeHtml(total)}</div>
        <div class="hero-label">indexed entities</div>
      </div>
      <div class="breakdown">${breakdown}</div>
    </div>
  </article>`;
}
