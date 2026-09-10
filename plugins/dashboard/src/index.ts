// Main plugin export
export { DashboardPlugin, dashboardPlugin } from "./plugin";
export type { DashboardConfig, DashboardConfigInput } from "./plugin";

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
export type { DashboardDigestLine } from "@brains/plugins";

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
