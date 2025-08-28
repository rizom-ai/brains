import { z } from "zod";
import type { Template } from "@brains/plugins";
import { RouteDefinitionSchema } from "./types/routes";

/**
 * Configuration schema for the site builder plugin
 */
export const siteBuilderConfigSchema = z.object({
  previewOutputDir: z
    .string()
    .optional()
    .describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .optional()
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
  templates: z.any().optional().describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  environment: z.enum(["preview", "production"]).default("preview").optional(),
});

export type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema> & {
  // Override the templates field type to be properly typed
  templates?: Record<string, Template>;
};

export const SITE_BUILDER_CONFIG_DEFAULTS = {
  previewOutputDir: "./dist/site-preview",
  productionOutputDir: "./dist/site-production",
  workingDir: "./.preact-work",
} as const;
