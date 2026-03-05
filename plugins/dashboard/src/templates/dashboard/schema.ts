import { z } from "@brains/utils";
import { WIDGET_RENDERERS } from "../../widget-registry";

/**
 * Schema for widget metadata (excludes dataProvider)
 */
export const widgetMetaSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  section: z.enum(["primary", "secondary", "sidebar"]),
  rendererName: z.enum(WIDGET_RENDERERS),
});

export type WidgetMeta = z.infer<typeof widgetMetaSchema>;

/**
 * Schema for widget data (metadata + fetched data)
 */
export const widgetDataSchema = z.object({
  widget: widgetMetaSchema,
  data: z.unknown(),
});

export type WidgetData = z.infer<typeof widgetDataSchema>;

/**
 * Schema for extensible dashboard data
 */
export const dashboardDataSchema = z.object({
  widgets: z.record(widgetDataSchema),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
