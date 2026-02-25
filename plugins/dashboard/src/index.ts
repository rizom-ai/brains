// Main plugin export
export { DashboardPlugin, dashboardPlugin } from "./plugin";

// Widget registry exports
export { DashboardWidgetRegistry } from "./widget-registry";
export type {
  RegisteredWidget,
  DashboardWidgetMeta,
  WidgetDataProvider,
} from "./widget-registry";
export { dashboardWidgetSchema } from "./widget-registry";

// DataSource exports
export {
  DashboardDataSource,
  dashboardDataSchema,
} from "./dashboard-datasource";
export type { DashboardData, WidgetData } from "./dashboard-datasource";
