import { DashboardWidget } from "./layout";
import { DashboardDataSchema, type DashboardData } from "./schema";
import { DashboardFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

/**
 * Dashboard template definition
 */
export const dashboardTemplate = createTemplate<DashboardData>({
  name: "dashboard",
  description: "Interactive system dashboard showing entity statistics",
  schema: DashboardDataSchema,
  basePrompt:
    "Generate system dashboard data with entity statistics and build information",
  requiredPermission: "public",
  formatter: new DashboardFormatter(),
  providerId: "system-stats",
  layout: {
    component: DashboardWidget,
    interactive: true,
  },
});

// Export all dashboard components
export { DashboardWidget } from "./layout";
export { DashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
