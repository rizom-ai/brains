import { z } from "@brains/utils";
import type { Template } from "@brains/plugins";
import { RouteDefinitionSchema } from "./types/routes";

/**
 * Configuration schema for the site builder plugin
 */
import type { ComponentChildren, JSX } from "preact";

import type { SiteInfo } from "./types/site-info";

// Layout component type - accepts JSX sections and returns JSX
export type LayoutComponent = (props: {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}) => JSX.Element;

export const siteBuilderConfigSchema = z.object({
  previewOutputDir: z
    .string()
    .optional()
    .describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .describe("Output directory for production builds")
    .default("./dist/site-production"),
  workingDir: z
    .string()
    .optional()
    .describe("Working directory for builds")
    .default("./.preact-work"),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
      copyright: z.string().optional(),
    })
    .default({
      title: "Rizom Brains",
      description: "A knowledge management system",
    }),
  themeCSS: z
    .string()
    .describe("Custom CSS theme overrides to inject into builds")
    .optional(),
  templates: z.any().optional().describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  layouts: z
    .record(z.any())
    .describe("Layout components (at least 'default' required)"),
  autoRebuild: z
    .boolean()
    .default(true)
    .describe("Automatically rebuild site when content changes"),
});

export type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema> & {
  // Override the templates field type to be properly typed
  templates?: Record<string, Template>;
  // Override the layouts field type to be properly typed (required)
  layouts: Record<string, LayoutComponent>;
};
