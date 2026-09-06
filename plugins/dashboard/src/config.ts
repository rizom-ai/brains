import { z } from "@brains/sdk/services";

type DashboardConfigSchema = z.ZodObject<{
  version: z.ZodDefault<z.ZodString>;
  routePath: z.ZodDefault<z.ZodString>;
  themeCSS: z.ZodOptional<z.ZodString>;
}>;

export const dashboardConfigSchema: DashboardConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  routePath: z.string().default("/dashboard"),
  themeCSS: z.string().optional(),
});

export type DashboardConfig = z.output<typeof dashboardConfigSchema>;
export type DashboardConfigInput = z.input<typeof dashboardConfigSchema>;
