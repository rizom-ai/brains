import type {
  DashboardWidgetSection,
  WidgetComponent,
  WidgetVisibility,
} from "./widget-registry";
import { z } from "@brains/utils/zod";

const widgetVisibilitySchema: z.ZodType<WidgetVisibility, WidgetVisibility> =
  z.enum(["public", "trusted", "anchor"]);

export interface WidgetDigestLine {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | undefined;
}

export const widgetDigestLineSchema: z.ZodType<
  WidgetDigestLine,
  WidgetDigestLine
> = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["plain", "good", "warn"]).optional(),
});

export interface WidgetMeta {
  id: string;
  pluginId: string;
  title: string;
  description?: string | undefined;
  group: string;
  priority: number;
  section: DashboardWidgetSection;
  rendererName: string;
  visibility: WidgetVisibility;
  needsOperator?: number | undefined;
  digest?: WidgetDigestLine[] | undefined;
  component?: WidgetComponent | undefined;
}

export const widgetMetaSchema: z.ZodType<WidgetMeta, WidgetMeta> = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  group: z.string().min(1),
  priority: z.number(),
  section: z.enum(["primary", "secondary", "sidebar"]),
  rendererName: z.string(),
  visibility: widgetVisibilitySchema,
  needsOperator: z.number().int().nonnegative().optional(),
  digest: z.array(widgetDigestLineSchema).max(4).optional(),
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
