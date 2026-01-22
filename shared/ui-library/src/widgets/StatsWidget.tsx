// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import { StatBox } from "../StatBox";
import type { BaseWidgetProps } from "./index";

/**
 * Schema for stats widget data - accepts flat or nested stats
 */
const statsDataSchema = z.record(z.unknown());

export type StatsWidgetProps = BaseWidgetProps;

/**
 * Stats widget renderer - displays key-value statistics using StatBox
 */
export function StatsWidget({
  title,
  description,
  data,
}: StatsWidgetProps): VNode {
  const parsed = statsDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3 text-theme">{title}</h3>
        {description && (
          <p className="text-sm text-theme-muted mb-3">{description}</p>
        )}
        <p className="text-sm text-theme-muted">No data available</p>
      </div>
    );
  }

  // Flatten nested stats object if present
  const stats: Record<string, number> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "stats" && typeof value === "object" && value !== null) {
      // Handle nested stats object (from system plugin)
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

  return (
    <div className="bg-theme-subtle rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3 text-theme">{title}</h3>
      {description && (
        <p className="text-sm text-theme-muted mb-3">{description}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(stats).map(([key, value]) => (
          <StatBox key={key} title={key} count={value} />
        ))}
      </div>
    </div>
  );
}
