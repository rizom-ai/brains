import type { ContentTemplate } from "@brains/types";
import { dashboardSchema, type DashboardData } from "./schema";
import dashboardPrompt from "./prompt.txt";

/**
 * Dashboard page template
 */
export const dashboardTemplate: ContentTemplate<DashboardData> = {
  name: "dashboard",
  description: "Dashboard page content with statistics",
  schema: dashboardSchema,
  basePrompt: dashboardPrompt,
};