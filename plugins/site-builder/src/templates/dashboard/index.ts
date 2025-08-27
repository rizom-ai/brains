import { DashboardWidget } from "./layout";
import { DashboardDataSchema, type DashboardData } from "./schema";
import { DashboardFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

/**
 * Dashboard template definition
 * Fetches real-time system statistics - does not generate content
 */
export const dashboardTemplate = createTemplate<DashboardData>({
  name: "dashboard",
  description: "Interactive system dashboard showing entity statistics",
  schema: DashboardDataSchema,
  requiredPermission: "public",
  formatter: new DashboardFormatter(),
  dataSourceId: "shell:system-stats", // Fetch-only DataSource for real-time stats
  layout: {
    component: DashboardWidget,
    interactive: true,
  },
});

// Export all dashboard components
export { DashboardWidget } from "./layout";
export { DashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
