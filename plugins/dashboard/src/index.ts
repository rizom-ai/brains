// Main plugin export
export { DashboardPlugin, dashboardPlugin } from "./plugin";

// Widget registry exports
export {
  BUILT_IN_WIDGET_RENDERERS,
  DashboardWidgetRegistry,
  dashboardDigestLineSchema,
  dashboardWidgetSchema,
  isBuiltInWidgetRenderer,
} from "./widget-registry";
export type {
  RegisteredWidget,
  DashboardDigestLine,
  DashboardWidgetMeta,
  WidgetComponent,
  WidgetComponentProps,
  WidgetDataProvider,
  WidgetVisibility,
} from "./widget-registry";

// DataSource exports
export { DashboardDataSource } from "./dashboard-datasource";
export { dashboardDataSchema } from "./widget-schema";
export type {
  DashboardData,
  WidgetData,
  WidgetDigestLine,
} from "./widget-schema";
