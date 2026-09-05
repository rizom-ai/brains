import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  PermissionService,
  UserPermissionLevelSchema,
  type DashboardDigestLine,
  type DashboardWidgetProviderContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { JSX } from "react";
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

const widgetComponentSchema: z.ZodCustom<WidgetComponent, WidgetComponent> =
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
export const widgetVisibilitySchema: typeof UserPermissionLevelSchema =
  UserPermissionLevelSchema;
export type WidgetVisibility = z.output<typeof widgetVisibilitySchema>;

export const dashboardWidgetSectionSchema: z.ZodEnum<{
  primary: "primary";
  secondary: "secondary";
  sidebar: "sidebar";
}> = z.enum(["primary", "secondary", "sidebar"]);
export type DashboardWidgetSection = z.output<
  typeof dashboardWidgetSectionSchema
>;

// Constrained to the shell's type rather than deriving a second one. The
// dashboard namespace in `@brains/plugins` declares what a widget may report;
// this schema is the check that a widget really reported it.
export const dashboardDigestLineSchema: z.ZodType<
  DashboardDigestLine,
  DashboardDigestLine
> = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["plain", "good", "warn"]).optional(),
});

export const dashboardWidgetSchema: z.ZodObject<{
  id: z.ZodString;
  pluginId: z.ZodString;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  group: z.ZodString;
  priority: z.ZodDefault<z.ZodNumber>;
  section: z.ZodDefault<typeof dashboardWidgetSectionSchema>;
  rendererName: z.ZodLiteral<typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER>;
  visibility: z.ZodDefault<typeof widgetVisibilitySchema>;
  needsAttention: z.ZodOptional<z.ZodNumber>;
  digest: z.ZodOptional<z.ZodArray<typeof dashboardDigestLineSchema>>;
}> = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  group: z.string().min(1),
  priority: z.number().default(50),
  section: dashboardWidgetSectionSchema.default("primary"),
  rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
  visibility: widgetVisibilitySchema.default("public"),
  needsAttention: z.number().int().nonnegative().optional(),
  digest: z.array(dashboardDigestLineSchema).max(4).optional(),
});

export type DashboardWidgetMeta = z.output<typeof dashboardWidgetSchema>;
export type DashboardWidgetInput = z.input<typeof dashboardWidgetSchema>;

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
