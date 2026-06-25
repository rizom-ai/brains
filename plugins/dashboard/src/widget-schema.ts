import { z } from "@brains/utils/zod-v4";
import type { WidgetComponent } from "./widget-registry";

const widgetVisibilitySchema = z.enum(["public", "trusted", "anchor"]);

export const widgetMetaSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  section: z.enum(["primary", "secondary", "sidebar"]),
  rendererName: z.string(),
  visibility: widgetVisibilitySchema,
  component: z.custom<WidgetComponent>().optional(),
});

export type WidgetMeta = z.output<typeof widgetMetaSchema>;

export const widgetDataSchema = z.object({
  widget: widgetMetaSchema,
  data: z.unknown(),
});

export type WidgetData = z.output<typeof widgetDataSchema>;

export const dashboardDataSchema = z.object({
  widgets: z.record(z.string(), widgetDataSchema),
});

export type DashboardData = z.output<typeof dashboardDataSchema>;
