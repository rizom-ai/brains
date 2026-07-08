import { UserPermissionLevelSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { WidgetComponent } from "./widget-registry";

export const widgetDigestLineSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["plain", "good", "warn"]).optional(),
});

export const widgetMetaSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  group: z.string().min(1),
  priority: z.number(),
  section: z.enum(["primary", "secondary", "sidebar"]),
  rendererName: z.string(),
  visibility: UserPermissionLevelSchema,
  needsOperator: z.number().int().nonnegative().optional(),
  digest: z.array(widgetDigestLineSchema).max(4).optional(),
  component: z.custom<WidgetComponent>().optional(),
});

export type WidgetDigestLine = z.infer<typeof widgetDigestLineSchema>;
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
