import { DashboardWidget } from "./layout";
import { DashboardDataSchema } from "./schema";
import { DashboardFormatter } from "./formatter";
import type { TemplateDefinition } from "@brains/types";

/**
 * Dashboard template definition
 */
export const dashboardTemplate: TemplateDefinition = {
  name: "dashboard",
  description: "Interactive system dashboard showing entity statistics",
  schema: DashboardDataSchema,
  component: DashboardWidget, // Use same component for both SSR and hydration
  formatter: new DashboardFormatter(),
  prompt: "", // Not AI generated
  interactive: true, // KEY: Marks this component for client-side hydration
};

// Export all dashboard components
export { DashboardWidget } from "./layout";
export { DashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
