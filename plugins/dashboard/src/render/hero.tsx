/** @jsxImportSource preact */
import { formatLabel } from "@brains/utils";
import type { JSX } from "preact";
import type { EntityCount } from "./types";

function BreakdownRow({
  entityType,
  count,
  max,
}: EntityCount & { max: number }): JSX.Element {
  const width = Math.max(4, Math.round((count / max) * 100));

  return (
    <div class="breakdown-row">
      <span class="breakdown-name">{formatLabel(entityType)}</span>
      <span class="breakdown-count">{count}</span>
      <div class="breakdown-bar">
        <i style={{ width: `${width}%` }}></i>
      </div>
    </div>
  );
}

export function HeroCard(props: {
  total: number;
  entityCounts: EntityCount[];
}): JSX.Element {
  const { total, entityCounts } = props;

  if (entityCounts.length === 0) {
    return (
      <article class="card card--hero">
        <div class="card-head">
          <span class="card-title">Entities</span>
        </div>
        <p class="muted">No indexed entities yet.</p>
      </article>
    );
  }

  const sorted = [...entityCounts].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 1;

  return (
    <article class="card card--hero">
      <div class="card-head">
        <span class="card-title">Entities</span>
        <span class="card-subtitle">corpus · sorted by volume</span>
      </div>
      <div class="entities">
        <div>
          <div class="hero-number">{total}</div>
          <div class="hero-label">indexed entities</div>
        </div>
        <div class="breakdown">
          {sorted.map((item) => (
            <BreakdownRow
              key={item.entityType}
              entityType={item.entityType}
              count={item.count}
              max={max}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
