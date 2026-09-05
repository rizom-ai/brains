import { DECLARATIVE_DASHBOARD_WIDGET_RENDERER } from "@brains/plugins";
import type { DashboardDigestLine } from "@brains/plugins";
import {
  dashboardDigestLineSchema,
  dashboardWidgetSectionSchema,
  widgetVisibilitySchema,
} from "./widget-registry";
import { z } from "@brains/utils/zod";

export type WidgetDigestLine = DashboardDigestLine;
export const widgetDigestLineSchema: typeof dashboardDigestLineSchema =
  dashboardDigestLineSchema;

export const widgetMetaSchema: z.ZodObject<{
  id: z.ZodString;
  pluginId: z.ZodString;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  group: z.ZodString;
  priority: z.ZodNumber;
  section: typeof dashboardWidgetSectionSchema;
  rendererName: z.ZodLiteral<typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER>;
  visibility: typeof widgetVisibilitySchema;
  needsAttention: z.ZodOptional<z.ZodNumber>;
  digest: z.ZodOptional<z.ZodArray<typeof widgetDigestLineSchema>>;
}> = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  group: z.string().min(1),
  priority: z.number(),
  section: dashboardWidgetSectionSchema,
  rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
  visibility: widgetVisibilitySchema,
  needsAttention: z.number().int().nonnegative().optional(),
  digest: z.array(widgetDigestLineSchema).max(4).optional(),
});

export type WidgetMeta = z.output<typeof widgetMetaSchema>;

export const widgetDataSchema: z.ZodObject<{
  widget: typeof widgetMetaSchema;
  data: z.ZodUnknown;
}> = z.object({
  widget: widgetMetaSchema,
  data: z.unknown(),
});

export type WidgetData = z.output<typeof widgetDataSchema>;

export const dashboardDataSchema: z.ZodObject<{
  widgets: z.ZodRecord<z.ZodString, typeof widgetDataSchema>;
}> = z.object({
  widgets: z.record(z.string(), widgetDataSchema),
});

export type DashboardData = z.output<typeof dashboardDataSchema>;
