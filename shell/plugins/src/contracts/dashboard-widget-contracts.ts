import { defineBusContract, type BusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { OperatorCaller } from "../operator/operator-context-contract";

export const DECLARATIVE_DASHBOARD_WIDGET_RENDERER =
  "DeclarativeOperatorWidget";

export interface DashboardWidgetProviderContext {
  readonly caller: OperatorCaller | null;
  readonly signal: AbortSignal;
}

type DashboardDigestLineSchema = z.ZodObject<{
  label: z.ZodString;
  value: z.ZodString;
  tone: z.ZodOptional<
    z.ZodEnum<{ plain: "plain"; good: "good"; warn: "warn" }>
  >;
}>;

export const dashboardDigestLineSchema: DashboardDigestLineSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["plain", "good", "warn"]).optional(),
});

export type DashboardDigestLine = z.output<typeof dashboardDigestLineSchema>;

export type DashboardWidgetDataProvider = (
  context: DashboardWidgetProviderContext,
) => Promise<unknown>;

/** Derives the digest strip from the widget's own data. */
export type DashboardWidgetDigestProvider = (data: unknown) => {
  digest?: DashboardDigestLine[];
  needsAttention?: number;
};

type DashboardWidgetRendererSchema = z.ZodObject<{
  component: z.ZodCustom<unknown, unknown>;
  clientStyles: z.ZodOptional<z.ZodString>;
  clientScript: z.ZodOptional<z.ZodString>;
}>;

/**
 * A first-party widget's own renderer, drawn instead of the declarative block
 * vocabulary. Set only by `registerBuiltInDashboardWidget` — the published
 * authoring path never produces one, so external services stay declarative.
 *
 * Deliberately structural: the dashboard plugin owns the component type and
 * narrows it on receipt, so the shell never depends on a rendering library.
 */
const dashboardWidgetRendererSchema: DashboardWidgetRendererSchema = z.object({
  component: z.custom<unknown>((value) => typeof value === "function", {
    message: "Expected dashboard widget component function",
  }),
  clientStyles: z.string().optional(),
  clientScript: z.string().optional(),
});

export type DashboardWidgetRenderer = z.input<
  typeof dashboardWidgetRendererSchema
>;

type DashboardWidgetRegistrationSchema = z.ZodObject<
  {
    id: z.ZodString;
    pluginId: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    group: z.ZodString;
    priority: z.ZodDefault<z.ZodNumber>;
    section: z.ZodDefault<
      z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
        sidebar: "sidebar";
      }>
    >;
    rendererName: z.ZodLiteral<typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER>;
    visibility: z.ZodDefault<
      z.ZodEnum<{ public: "public"; trusted: "trusted"; admin: "admin" }>
    >;
    needsAttention: z.ZodOptional<z.ZodNumber>;
    digest: z.ZodOptional<z.ZodArray<DashboardDigestLineSchema>>;
    dataProvider: z.ZodCustom<
      DashboardWidgetDataProvider,
      DashboardWidgetDataProvider
    >;
    digestProvider: z.ZodOptional<
      z.ZodCustom<DashboardWidgetDigestProvider, DashboardWidgetDigestProvider>
    >;
    /**
     * Present means "draw this instead of the blocks". The dashboard resolves
     * it at render time from its own registry; it never travels with widget
     * data.
     */
    renderer: z.ZodOptional<DashboardWidgetRendererSchema>;
  },
  z.core.$strict
>;

/** A widget registration as the Dashboard receives it. */
const dashboardWidgetRegistrationSchema: DashboardWidgetRegistrationSchema = z
  .object({
    id: z.string(),
    pluginId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    group: z.string().min(1),
    priority: z.number().default(50),
    section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
    rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
    visibility: z.enum(["public", "trusted", "admin"]).default("public"),
    needsAttention: z.number().int().nonnegative().optional(),
    digest: z.array(dashboardDigestLineSchema).max(4).optional(),
    dataProvider: z.custom<DashboardWidgetDataProvider>(
      (value) => typeof value === "function",
      { message: "Expected dashboard widget data provider function" },
    ),
    digestProvider: z
      .custom<DashboardWidgetDigestProvider>(
        (value) => typeof value === "function",
        { message: "Expected dashboard widget digest provider function" },
      )
      .optional(),
    renderer: dashboardWidgetRendererSchema.optional(),
  })
  .strict();

/**
 * A widget's registration, minus `pluginId` — the namespace fills that in from
 * the registering plugin so a widget cannot claim another plugin's id.
 */
export type DashboardWidgetRegistration = Omit<
  z.input<typeof dashboardWidgetRegistrationSchema>,
  "pluginId"
>;

type DashboardWidgetUnregistrationSchema = z.ZodObject<{
  pluginId: z.ZodString;
  widgetId: z.ZodOptional<z.ZodString>;
}>;

const dashboardWidgetUnregistrationSchema: DashboardWidgetUnregistrationSchema =
  z.object({
    pluginId: z.string(),
    widgetId: z.string().optional(),
  });

/** Contribute a widget to the Dashboard, which owns it. */
export const dashboardWidgetRegisterContract: BusContract<
  DashboardWidgetRegistrationSchema,
  z.ZodVoid,
  "request"
> = defineBusContract({
  channel: "dashboard:register-widget",
  request: dashboardWidgetRegistrationSchema,
  response: z.void(),
  delivery: "request",
});

/** Withdraw one widget, or every widget, of a plugin from the Dashboard. */
export const dashboardWidgetUnregisterContract: BusContract<
  DashboardWidgetUnregistrationSchema,
  z.ZodVoid,
  "request"
> = defineBusContract({
  channel: "dashboard:unregister-widget",
  request: dashboardWidgetUnregistrationSchema,
  response: z.void(),
  delivery: "request",
});
