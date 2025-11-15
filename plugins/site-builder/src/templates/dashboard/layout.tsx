// @ts-ignore TS6133 - h is required for JSX compilation in classic transform
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import type { VNode } from "preact";
import { type DashboardData, type EntityStat } from "./schema";
import { StatBox } from "@brains/ui-library";

interface DashboardRenderProps {
  data: DashboardData;
  sortedStats: EntityStat[];
  filter: string;
  sortBy: "type" | "count";
  showDetails: boolean;
  onFilterChange?: (value: string) => void;
  onSortChange?: () => void;
  onToggleDetails?: () => void;
}

/**
 * Pure functional component for rendering dashboard - works in SSR
 */
const DashboardRender = ({
  data,
  sortedStats,
  filter,
  sortBy,
  showDetails,
  onFilterChange,
  onSortChange,
  onToggleDetails,
}: DashboardRenderProps): VNode => {
  return (
    <div
      className="dashboard-widget p-6 bg-theme-subtle rounded-lg"
      data-component="site-builder:dashboard"
    >
      <h2 className="text-2xl font-bold mb-4 text-theme">System Dashboard</h2>

      {/* Interactive controls - match static template structure */}
      <div
        className="mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4"
        data-hydrate-controls="true"
      >
        <input
          type="text"
          placeholder="Filter types..."
          value={filter}
          onInput={
            onFilterChange
              ? (e): void =>
                  onFilterChange((e.target as HTMLInputElement).value)
              : undefined
          }
          className="px-4 py-2 bg-theme border border-theme rounded text-theme placeholder-theme-muted sm:flex-1"
        />
        <button
          onClick={onSortChange}
          className="px-4 py-2 bg-brand text-theme-inverse rounded hover:bg-brand-dark"
        >
          Sort by {sortBy === "count" ? "Type" : "Count"}
        </button>
        <button
          onClick={onToggleDetails}
          className="px-4 py-2 bg-theme-muted text-theme rounded border border-theme hover:bg-theme-subtle"
        >
          {showDetails ? "Hide" : "Show"} Details
        </button>
      </div>

      {/* Entity statistics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {sortedStats.map((stat) => (
          <StatBox key={stat.type} title={stat.type} count={stat.count} />
        ))}
      </div>

      {/* Recent entities - shown when details are toggled */}
      {showDetails && (
        <div className="mt-6 text-theme">
          <h3 className="text-lg font-semibold mb-3">Recent Entities</h3>
          <div className="space-y-2">
            {data.recentEntities.map((entity) => (
              <div
                key={entity.id}
                className="bg-theme p-3 rounded border border-theme"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{entity.title}</h4>
                    <p className="text-sm text-theme-muted">
                      Type: {entity.type} | ID: {entity.id}
                    </p>
                  </div>
                  <span className="text-xs text-theme-muted">
                    {new Date(entity.created).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Build info */}
      <div className="mt-6 text-sm text-theme-muted">
        Built: {new Date(data.buildInfo.timestamp).toLocaleString()}
      </div>
    </div>
  );
};

/**
 * Interactive wrapper component with hooks for hydration
 */
export const DashboardWidget = (data: DashboardData): VNode => {
  // Check if we're in a browser environment (has window)
  const isBrowser = typeof window !== "undefined";

  if (!isBrowser) {
    // SSR: render without hooks
    const sortedStats = [...data.entityStats].sort((a, b) => b.count - a.count);
    return (
      <DashboardRender
        data={data}
        sortedStats={sortedStats}
        filter=""
        sortBy="count"
        showDetails={false}
      />
    );
  }

  // Browser: use hooks for interactivity
  const [sortBy, setSortBy] = useState<"type" | "count">("count");
  const [showDetails, setShowDetails] = useState(false);
  const [filter, setFilter] = useState("");

  // Client-side sorting and filtering
  const sortedStats = useMemo(() => {
    return [...data.entityStats]
      .filter((s) => s.type.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) =>
        sortBy === "count" ? b.count - a.count : a.type.localeCompare(b.type),
      );
  }, [data.entityStats, sortBy, filter]);

  return (
    <DashboardRender
      data={data}
      sortedStats={sortedStats}
      filter={filter}
      sortBy={sortBy}
      showDetails={showDetails}
      onFilterChange={setFilter}
      onSortChange={() => setSortBy(sortBy === "count" ? "type" : "count")}
      onToggleDetails={() => setShowDetails(!showDetails)}
    />
  );
};
