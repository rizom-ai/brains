import { DashboardWidget } from "./layout";
import { DashboardDataSchema, type DashboardData } from "./schema";
import { DashboardFormatter } from "./formatter";
import type { Template } from "@brains/plugins";

/**
 * Dashboard template definition
 */
export const dashboardTemplate: Template<DashboardData> = {
  name: "dashboard",
  description: "Interactive system dashboard showing entity statistics",
  schema: DashboardDataSchema,
  // No basePrompt - uses getData instead
  requiredPermission: "public",
  formatter: new DashboardFormatter(),
  getData: async (): Promise<DashboardData> => {
    // TODO: Implement real data fetching when dependencies are properly typed
    // For now, return mock data to avoid type issues
    return new DashboardFormatter().getMockData();
  },
  layout: {
    component: DashboardWidget, // Use same component for both SSR and hydration
    interactive: true, // KEY: Marks this component for client-side hydration
  },
};

// Export all dashboard components
export { DashboardWidget } from "./layout";
export { DashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
