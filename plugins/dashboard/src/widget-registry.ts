import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  PermissionService,
  type DashboardWidgetProviderContext,
  type UserPermissionLevel,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { JSX } from "preact";
import { z } from "@brains/utils/zod";

/**
 * The dashboard's own render contract for first-party widgets. The shell
 * carries the component as `unknown`; this is where it is given a type and
 * validated on receipt.
 */
export interface WidgetComponentProps {
  data: unknown;
}
export type WidgetComponent = (
  props: WidgetComponentProps,
) => JSX.Element | null;

const widgetComponentSchema: z.ZodType<WidgetComponent, WidgetComponent> =
  z.custom<WidgetComponent>((value) => typeof value === "function", {
    message: "widget component must be a function",
  });

export type WidgetDataProvider = (
  context: DashboardWidgetProviderContext,
) => Promise<unknown>;
/** Derives live digest lines / attention counts from the widget's fetched data. */
export type WidgetDigestProvider = (data: unknown) => {
  digest?: DashboardDigestLine[];
  needsAttention?: number;
};
export type WidgetVisibility = UserPermissionLevel;

const widgetVisibilitySchema: z.ZodType<WidgetVisibility, WidgetVisibility> =
  z.enum(["public", "trusted", "admin"]);

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
  rendererName: typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER;
  visibility: WidgetVisibility;
  needsAttention?: number | undefined;
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
  rendererName: typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER;
  visibility?: WidgetVisibility | undefined;
  needsAttention?: number | undefined;
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
  rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
  visibility: widgetVisibilitySchema.default("public"),
  needsAttention: z.number().int().nonnegative().optional(),
  digest: z.array(dashboardDigestLineSchema).max(4).optional(),
});

/**
 * The renderer a first-party widget brings with it. Kept beside the widget in
 * the registry rather than on its meta, so it never crosses the parsed data
 * boundary into the rendered document's widget payload.
 */
export interface WidgetRenderer {
  component: WidgetComponent;
  clientStyles?: string | undefined;
  clientScript?: string | undefined;
}

export interface RegisteredWidget extends DashboardWidgetInput {
  dataProvider: WidgetDataProvider;
  digestProvider?: WidgetDigestProvider;
  renderer?: WidgetRenderer | undefined;
}

export interface StoredRegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
  digestProvider?: WidgetDigestProvider;
  renderer?: WidgetRenderer | undefined;
}

export class DashboardWidgetRegistry {
  private widgets = new Map<string, StoredRegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  register(widget: RegisteredWidget): void {
    const parsedWidget = dashboardWidgetSchema.parse(widget);
    const renderer = this.parseRenderer(widget);
    const normalizedWidget: StoredRegisteredWidget = {
      ...parsedWidget,
      dataProvider: widget.dataProvider,
      ...(widget.digestProvider
        ? { digestProvider: widget.digestProvider }
        : {}),
      ...(renderer ? { renderer } : {}),
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

  private parseRenderer(widget: RegisteredWidget): WidgetRenderer | undefined {
    if (!widget.renderer) return undefined;
    return {
      component: widgetComponentSchema.parse(widget.renderer.component),
      ...(widget.renderer.clientStyles
        ? { clientStyles: widget.renderer.clientStyles }
        : {}),
      ...(widget.renderer.clientScript
        ? { clientScript: widget.renderer.clientScript }
        : {}),
    };
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
