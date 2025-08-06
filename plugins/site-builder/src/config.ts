import { z } from "zod";
import { TemplateSchema } from "@brains/plugins";
import { RouteDefinitionSchema } from "@brains/plugins";

/**
 * Configuration schema for the site builder plugin
 */
export const siteBuilderConfigSchema = z.object({
  previewOutputDir: z.string().describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .describe("Output directory for production builds"),
  workingDir: z.string().optional().describe("Working directory for builds"),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
    })
    .default({
      title: "Personal Brain",
      description: "A knowledge management system",
    })
    .optional(),
  templates: z
    .record(TemplateSchema)
    .optional()
    .describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  environment: z.enum(["preview", "production"]).default("preview").optional(),
});

export type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema>;
export type SiteBuilderConfigInput = Partial<
  z.input<typeof siteBuilderConfigSchema>
>;

export const SITE_BUILDER_CONFIG_DEFAULTS = {
  previewOutputDir: "./site-preview",
  productionOutputDir: "./site-production",
} as const;
