import { DashboardWidget } from "./layout";
import { dashboardDataSchema, type DashboardData } from "./schema";
import { DashboardFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";
// Pre-compiled by scripts/compile-hydration.ts (run via turbo precompile)
import hydrationScript from "./hydration.compiled.js" with { type: "text" };

/**
 * Dashboard template definition
 * Renders extensible dashboard with plugin-contributed widgets
 */
export const dashboardTemplate = createTemplate<DashboardData>({
  name: "dashboard",
  description: "Extensible dashboard with plugin-contributed widgets",
  schema: dashboardDataSchema,
  requiredPermission: "public",
  formatter: new DashboardFormatter(),
  dataSourceId: "dashboard:dashboard",
  layout: {
    component: DashboardWidget,
    interactive: hydrationScript,
  },
});

export { DashboardWidget } from "./layout";
export { dashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
