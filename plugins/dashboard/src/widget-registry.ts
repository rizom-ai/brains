import type { ComponentType } from "preact";
import { PermissionService, type UserPermissionLevel } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export interface WidgetComponentProps {
  title: string;
  description?: string;
  data: unknown;
}

export type WidgetComponent = ComponentType<WidgetComponentProps>;
export type WidgetDataProvider = () => Promise<unknown>;
export type WidgetVisibility = UserPermissionLevel;

export const BUILT_IN_WIDGET_RENDERERS = [
  "StatsWidget",
  "ListWidget",
  "CustomWidget",
  "PipelineWidget",
  "IdentityWidget",
  "ProfileWidget",
  "SystemWidget",
] as const;

export type BuiltInWidgetRendererName =
  (typeof BUILT_IN_WIDGET_RENDERERS)[number];

const builtInWidgetRendererSet = new Set<string>(BUILT_IN_WIDGET_RENDERERS);
const widgetVisibilitySchema: z.ZodType<WidgetVisibility, WidgetVisibility> =
  z.enum(["public", "trusted", "anchor"]);

export function isBuiltInWidgetRenderer(
  rendererName: string,
): rendererName is BuiltInWidgetRendererName {
  return builtInWidgetRendererSet.has(rendererName);
}

export type DashboardWidgetSection = "primary" | "secondary" | "sidebar";

export interface DashboardDigestLine {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | undefined;
}

export const dashboardDigestLineSchema: z.ZodType<
  DashboardDigestLine,
  DashboardDigestLine
> = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["plain", "good", "warn"]).optional(),
});

export interface DashboardWidgetMeta {
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
  digest?: DashboardDigestLine[] | undefined;
}

export interface DashboardWidgetInput {
  id: string;
  pluginId: string;
  title: string;
  description?: string | undefined;
  group: string;
  priority?: number | undefined;
  section?: DashboardWidgetSection | undefined;
  rendererName: string;
  visibility?: WidgetVisibility | undefined;
  needsOperator?: number | undefined;
  digest?: DashboardDigestLine[] | undefined;
}

export const dashboardWidgetSchema: z.ZodType<
  DashboardWidgetMeta,
  DashboardWidgetInput
> = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  group: z.string().min(1),
  priority: z.number().default(50),
  section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
  rendererName: z.string(),
  visibility: widgetVisibilitySchema.default("public"),
  needsOperator: z.number().int().nonnegative().optional(),
  digest: z.array(dashboardDigestLineSchema).max(4).optional(),
});

export interface RegisteredWidget extends DashboardWidgetInput {
  dataProvider: WidgetDataProvider;
  component?: WidgetComponent;
  clientScript?: string;
}

export interface StoredRegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
  component?: WidgetComponent;
  clientScript?: string;
}

export class DashboardWidgetRegistry {
  private widgets = new Map<string, StoredRegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  register(widget: RegisteredWidget): void {
    const parsedWidget = dashboardWidgetSchema.parse(widget);
    const normalizedWidget: StoredRegisteredWidget = {
      ...parsedWidget,
      dataProvider: widget.dataProvider,
      ...(widget.component ? { component: widget.component } : {}),
      ...(widget.clientScript ? { clientScript: widget.clientScript } : {}),
    };
    const key = `${normalizedWidget.pluginId}:${normalizedWidget.id}`;
    this.widgets.set(key, normalizedWidget);
    this.logger.debug("Dashboard widget registered", {
      key,
      title: normalizedWidget.title,
      rendererName: normalizedWidget.rendererName,
      group: normalizedWidget.group,
    });
  }

  unregister(pluginId: string, widgetId?: string): void {
    if (widgetId) {
      this.widgets.delete(`${pluginId}:${widgetId}`);
      return;
    }

    for (const key of this.widgets.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.widgets.delete(key);
      }
    }
  }

  get(pluginId: string, widgetId: string): StoredRegisteredWidget | undefined {
    return this.widgets.get(`${pluginId}:${widgetId}`);
  }

  list(
    options:
      | "primary"
      | "secondary"
      | "sidebar"
      | {
          section?: "primary" | "secondary" | "sidebar";
          permissionLevel?: WidgetVisibility;
        } = {},
  ): StoredRegisteredWidget[] {
    const resolved =
      typeof options === "string" ? { section: options } : options;
    const permissionLevel = resolved.permissionLevel ?? "public";

    return Array.from(this.widgets.values())
      .filter(
        (widget) => !resolved.section || widget.section === resolved.section,
      )
      .filter((widget) =>
        PermissionService.hasPermission(permissionLevel, widget.visibility),
      )
      .sort((a, b) => a.priority - b.priority);
  }

  get size(): number {
    return this.widgets.size;
  }
}
