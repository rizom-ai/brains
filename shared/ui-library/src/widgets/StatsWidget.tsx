// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const statsDataSchema = z.record(z.unknown());

export type StatsWidgetProps = BaseWidgetProps;

/**
 * Stats widget renderer - displays key-value statistics in a dense horizontal row
 */
export function StatsWidget({ title, data }: StatsWidgetProps): VNode {
  const parsed = statsDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-4">
          {title}
        </div>
        <p className="text-sm text-theme-muted">No data available</p>
      </div>
    );
  }

  // Flatten nested stats object if present
  const stats: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "stats" && typeof value === "object" && value !== null) {
      for (const [statKey, statValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (typeof statValue === "number") {
          stats[statKey] = statValue;
        }
      }
    } else if (typeof value === "number") {
      stats[key] = value;
    }
  }

  const entries = Object.entries(stats);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          {title}
        </span>
        {total > 0 && (
          <span className="font-mono text-[0.625rem] px-2 py-0.5 rounded-full bg-status-info-bg text-status-info-text font-medium">
            {total} total
          </span>
        )}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(5rem, 1fr))" }}
      >
        {entries.map(([key, value], i) => (
          <div
            key={key}
            className={`text-center p-3 ${i > 0 ? "border-l border-theme" : ""}`}
          >
            <div className="text-[1.75rem] font-bold text-heading leading-none mb-1 tabular-nums">
              {value}
            </div>
            <div className="text-[0.7rem] text-theme-muted font-medium">
              {key}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
