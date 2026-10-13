import type { Template } from "@brains/plugins";
import type { LayoutComponent } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import {
  RouteDefinitionSchema,
  siteMetadataSchema,
  type EntityDisplayEntry,
} from "@brains/site-composition";

/**
 * Entity display metadata per entity type.
 *
 * Keyed by entity type (e.g. "post", "link", "social-post"). Each entry
 * describes how that entity type should present itself — label, plural
 * name, default layout, pagination, and navigation slot. Consulted by
 * the dynamic route generator when producing auto-generated list/detail
 * routes for active entity plugins.
 */
export type { EntityDisplayEntry };
export type EntityDisplayMap = Record<string, EntityDisplayEntry>;

type SiteBuilderConfigSchema = z.ZodObject<{
  previewOutputDir: z.ZodDefault<z.ZodString>;
  productionOutputDir: z.ZodDefault<z.ZodString>;
  sharedImagesDir: z.ZodDefault<z.ZodString>;
  workingDir: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  siteInfo: z.ZodDefault<typeof siteMetadataSchema>;
  themeCSS: z.ZodOptional<z.ZodString>;
  analyticsScript: z.ZodOptional<z.ZodString>;
  headScripts: z.ZodDefault<z.ZodArray<z.ZodString>>;
  templates: z.ZodOptional<
    z.ZodCustom<Record<string, Template>, Record<string, Template>>
  >;
  routes: z.ZodOptional<z.ZodArray<typeof RouteDefinitionSchema>>;
  layouts: z.ZodOptional<
    z.ZodRecord<z.ZodString, z.ZodCustom<LayoutComponent, LayoutComponent>>
  >;
  autoRebuild: z.ZodDefault<z.ZodBoolean>;
  rebuildDebounce: z.ZodDefault<z.ZodNumber>;
  staticAssets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}>;

export const siteBuilderConfigSchema: SiteBuilderConfigSchema = z.object({
  previewOutputDir: z
    .string()
    .describe("Output directory for preview builds")
    .default("./dist/site-preview"),
  productionOutputDir: z
    .string()
    .describe("Output directory for production builds")
    .default("./dist/site-production"),
  sharedImagesDir: z
    .string()
    .describe(
      "Shared directory for optimized images (used by both preview and production)",
    )
    .default("./dist/images"),
  workingDir: z
    .string()
    .optional()
    .describe("Working directory for builds")
    .default("./.react-work"),
  siteInfo: siteMetadataSchema.default({
    represents: "anchor",
    title: "Brain",
    description: "A knowledge management system",
  }),
  themeCSS: z
    .string()
    .describe("Custom CSS theme overrides to inject into builds")
    .optional(),
  analyticsScript: z
    .string()
    .describe(
      "Analytics tracking script to inject into page head (e.g., Cloudflare Web Analytics)",
    )
    .optional(),
  headScripts: z
    .array(z.string())
    .default([])
    .describe("Global scripts to inject into every rendered page head"),
  // Templates and layouts carry runtime objects (components, render
  // functions) that cannot be validated; z.custom keeps their type in the
  // parsed config without pretending to check them.
  templates: z
    .custom<Record<string, Template>>()
    .optional()
    .describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  layouts: z
    .record(z.string(), z.custom<LayoutComponent>())
    .optional()
    .describe("Layout components (at least 'default' required)"),
  autoRebuild: z
    .boolean()
    .default(true)
    .describe("Automatically rebuild site when content changes"),
  rebuildDebounce: z
    .number()
    .min(100)
    .describe(
      "Debounce time in ms before triggering site rebuild after content changes",
    )
    .default(5000),
  staticAssets: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Static files to write to the output directory at build time. Keys are output paths (e.g. '/canvases/tree.js'), values are file contents as strings. Typically supplied by a SitePackage via text imports.",
    ),
});

/** Full site-builder config after defaults are applied. */
export type SiteBuilderConfig = z.output<typeof siteBuilderConfigSchema>;
export type SiteBuilderConfigInput = z.input<typeof siteBuilderConfigSchema>;
