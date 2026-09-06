import { dashboardService } from "./service";

export {
  dashboardService,
  type DashboardDeps,
  type DashboardReads,
  type DashboardState,
} from "./service";
export {
  dashboardConfigSchema,
  type DashboardConfig,
  type DashboardConfigInput,
} from "./config";

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
export type { DashboardDigestLine } from "@brains/sdk/services";

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

/** The dashboard as a brain composes it. */
const dashboardPackage: ReturnType<typeof dashboardService> =
  dashboardService();
export default dashboardPackage;
