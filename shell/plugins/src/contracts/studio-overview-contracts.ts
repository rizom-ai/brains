import { defineBusContract, type BusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetDataProvider,
  type DashboardWidgetDigestProvider,
} from "./dashboard-widget-contracts";

type StudioOverviewContributionSchema = z.ZodObject<
  {
    id: z.ZodString;
    pluginId: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    group: z.ZodString;
    rendererName: z.ZodLiteral<typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER>;
    priority: z.ZodDefault<z.ZodNumber>;
    section: z.ZodDefault<
      z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
        sidebar: "sidebar";
      }>
    >;
    visibility: z.ZodEnum<{ trusted: "trusted"; admin: "admin" }>;
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
    dataProvider: z.ZodCustom<
      DashboardWidgetDataProvider,
      DashboardWidgetDataProvider
    >;
    digestProvider: z.ZodOptional<
      z.ZodCustom<DashboardWidgetDigestProvider, DashboardWidgetDigestProvider>
    >;
  },
  z.core.$strict
>;

/**
 * A non-public semantic widget re-homed into Studio's Overview workspace.
 * Overview draws the widget's semantic view, so it carries no renderer.
 */
export const studioOverviewContributionSchema: StudioOverviewContributionSchema =
  z
    .object({
      id: z.string().trim().min(1).max(120),
      pluginId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(160),
      description: z.string().max(500).optional(),
      group: z.string().trim().min(1).max(120),
      rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
      priority: z.number().int().default(50),
      section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
      visibility: z.enum(["trusted", "admin"]),
      needsAttention: z.number().int().nonnegative().optional(),
      digest: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(160),
            value: z.string().max(500),
            tone: z.enum(["plain", "good", "warn"]).optional(),
          }),
        )
        .max(4)
        .optional(),
      dataProvider: z.custom<DashboardWidgetDataProvider>(
        (value) => typeof value === "function",
        { message: "Expected Overview contribution data provider function" },
      ),
      digestProvider: z
        .custom<DashboardWidgetDigestProvider>(
          (value) => typeof value === "function",
          {
            message: "Expected Overview contribution digest provider function",
          },
        )
        .optional(),
    })
    .strict();

export type StudioOverviewContributionRegistration = z.input<
  typeof studioOverviewContributionSchema
>;

type StudioOverviewContributionUnregistrationSchema = z.ZodObject<{
  pluginId: z.ZodString;
  contributionId: z.ZodOptional<z.ZodString>;
}>;

const studioOverviewContributionUnregistrationSchema: StudioOverviewContributionUnregistrationSchema =
  z.object({
    pluginId: z.string(),
    contributionId: z.string().optional(),
  });

export type StudioOverviewContributionUnregistration = z.input<
  typeof studioOverviewContributionUnregistrationSchema
>;

/** Re-home a non-public widget into Studio's Overview, which owns it. */
export const studioOverviewContributionRegisterContract: BusContract<
  StudioOverviewContributionSchema,
  z.ZodVoid,
  "request"
> = defineBusContract({
  channel: "studio:register-overview-contribution",
  request: studioOverviewContributionSchema,
  response: z.void(),
  delivery: "request",
});

/** Withdraw one contribution, or every contribution, of a plugin from Overview. */
export const studioOverviewContributionUnregisterContract: BusContract<
  StudioOverviewContributionUnregistrationSchema,
  z.ZodVoid,
  "request"
> = defineBusContract({
  channel: "studio:unregister-overview-contribution",
  request: studioOverviewContributionUnregistrationSchema,
  response: z.void(),
  delivery: "request",
});
