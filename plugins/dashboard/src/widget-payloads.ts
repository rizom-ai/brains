import { DECLARATIVE_DASHBOARD_WIDGET_RENDERER, z } from "@brains/sdk/services";
import type {
  RegisteredWidget,
  WidgetComponent,
  WidgetDataProvider,
  WidgetDigestProvider,
} from "./widget-registry";

/**
 * What a package announces when it declares a dashboard widget.
 *
 * Strict: the runtime builds this payload from a declaration, so a field
 * nobody declared is a mistake worth failing on rather than ignoring. The
 * providers are functions, which only a runtime check can confirm.
 */
type RegisterWidgetPayloadSchema = z.ZodObject<
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
    digest: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<{
          label: z.ZodString;
          value: z.ZodString;
          tone: z.ZodOptional<
            z.ZodEnum<{ plain: "plain"; good: "good"; warn: "warn" }>
          >;
        }>
      >
    >;
    dataProvider: z.ZodCustom<WidgetDataProvider, WidgetDataProvider>;
    digestProvider: z.ZodOptional<
      z.ZodCustom<WidgetDigestProvider, WidgetDigestProvider>
    >;
    renderer: z.ZodOptional<
      z.ZodObject<{
        component: z.ZodCustom<WidgetComponent, WidgetComponent>;
        clientStyles: z.ZodOptional<z.ZodString>;
        clientScript: z.ZodOptional<z.ZodString>;
      }>
    >;
  },
  z.core.$strict
>;

export const registerWidgetPayloadSchema: RegisterWidgetPayloadSchema = z
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
    digest: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          tone: z.enum(["plain", "good", "warn"]).optional(),
        }),
      )
      .max(4)
      .optional(),
    dataProvider: z.custom<WidgetDataProvider>(
      (value) => typeof value === "function",
      {
        message: "Expected dashboard widget data provider function",
      },
    ),
    digestProvider: z
      .custom<WidgetDigestProvider>((value) => typeof value === "function", {
        message: "Expected dashboard widget digest provider function",
      })
      .optional(),
    renderer: z
      .object({
        component: z.custom<WidgetComponent>(
          (value) => typeof value === "function",
          { message: "Expected dashboard widget component function" },
        ),
        clientStyles: z.string().optional(),
        clientScript: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export const unregisterWidgetPayloadSchema: z.ZodObject<{
  pluginId: z.ZodString;
  widgetId: z.ZodOptional<z.ZodString>;
}> = z.object({
  pluginId: z.string(),
  widgetId: z.string().optional(),
});

export function createRegisteredWidget(
  payload: z.output<typeof registerWidgetPayloadSchema>,
): RegisteredWidget {
  return {
    id: payload.id,
    pluginId: payload.pluginId,
    title: payload.title,
    ...(payload.description ? { description: payload.description } : {}),
    group: payload.group,
    priority: payload.priority,
    section: payload.section,
    rendererName: payload.rendererName,
    visibility: payload.visibility,
    ...(payload.needsAttention !== undefined && {
      needsAttention: payload.needsAttention,
    }),
    ...(payload.digest ? { digest: payload.digest } : {}),
    dataProvider: payload.dataProvider,
    ...(payload.digestProvider
      ? { digestProvider: payload.digestProvider }
      : {}),
    ...(payload.renderer ? { renderer: payload.renderer } : {}),
  };
}
