import { z } from "@brains/utils/zod-v4";
import type {
  DashboardWidgetSection,
  WidgetComponent,
  WidgetVisibility,
} from "./widget-registry";

const widgetVisibilitySchema: z.ZodType<WidgetVisibility, WidgetVisibility> =
  z.enum(["public", "trusted", "anchor"]);

export interface WidgetMeta {
  id: string;
  pluginId: string;
  title: string;
  description?: string | undefined;
  priority: number;
  section: DashboardWidgetSection;
  rendererName: string;
  visibility: WidgetVisibility;
  component?: WidgetComponent | undefined;
}

export const widgetMetaSchema: z.ZodType<WidgetMeta, WidgetMeta> = z.object({
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

export interface WidgetData {
  widget: WidgetMeta;
  data: unknown;
}

export const widgetDataSchema: z.ZodType<WidgetData, WidgetData> = z.object({
  widget: widgetMetaSchema,
  data: z.unknown(),
});

export interface DashboardData {
  widgets: Record<string, WidgetData>;
}

export const dashboardDataSchema: z.ZodType<DashboardData, DashboardData> =
  z.object({
    widgets: z.record(z.string(), widgetDataSchema),
  });
