import { z } from "@brains/utils";
import type { WidgetComponent } from "./widget-registry";

export const widgetMetaSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  section: z.enum(["primary", "secondary", "sidebar"]),
  rendererName: z.string(),
  visibility: z.enum(["public", "operator"]),
  component: z.custom<WidgetComponent>().optional(),
});

export type WidgetMeta = z.infer<typeof widgetMetaSchema>;

export const widgetDataSchema = z.object({
  widget: widgetMetaSchema,
  data: z.unknown(),
});

export type WidgetData = z.infer<typeof widgetDataSchema>;

export const dashboardDataSchema = z.object({
  widgets: z.record(widgetDataSchema),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
