import { createDashboardPackage } from "./plugin";

// The package, as a brain composes it
export { createDashboardPackage, dashboardConfigSchema } from "./plugin";
export type {
  DashboardConfig,
  DashboardConfigInput,
  DashboardState,
} from "./plugin";

// Widget registry exports
export {
  DashboardWidgetRegistry,
  dashboardDigestLineSchema,
  dashboardWidgetSchema,
} from "./widget-registry";
export type {
  RegisteredWidget,
  DashboardWidgetMeta,
  WidgetDataProvider,
  WidgetVisibility,
} from "./widget-registry";
// Part of this plugin's surface; the dashboard namespace owns the type.
export type { DashboardDigestLine } from "@brains/sdk/internal/service-runtime";

// DataSource exports
export { DashboardDataSource } from "./dashboard-datasource";
export { dashboardDataSchema } from "./widget-schema";
export type {
  DashboardData,
  WidgetData,
  WidgetDigestLine,
} from "./widget-schema";

// Page renderer, exposed for the root console visual-regression script
export { renderDashboardPageHtml } from "./dashboard-page";
export type { DashboardRenderInput } from "./dashboard-page";

/** The Dashboard, as a brain composes it. */
const dashboardPackage: ReturnType<typeof createDashboardPackage> =
  createDashboardPackage();
export default dashboardPackage;
