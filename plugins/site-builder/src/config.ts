import type { Template } from "@brains/plugins";
import type { LayoutComponent } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import {
  NavigationSlots,
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

type EntityDisplayEntrySchema = z.ZodObject<{
  label: z.ZodString;
  pluralName: z.ZodOptional<z.ZodString>;
  layout: z.ZodOptional<z.ZodString>;
  paginate: z.ZodOptional<z.ZodBoolean>;
  pageSize: z.ZodOptional<z.ZodNumber>;
  navigation: z.ZodOptional<
    z.ZodObject<{
      show: z.ZodOptional<z.ZodBoolean>;
      slot: z.ZodOptional<
        z.ZodEnum<{ primary: "primary"; secondary: "secondary" }>
      >;
      priority: z.ZodOptional<z.ZodNumber>;
    }>
  >;
}>;

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
  entityDisplay: z.ZodOptional<
    z.ZodRecord<z.ZodString, EntityDisplayEntrySchema>
  >;
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
  entityDisplay: z
    .record(
      z.string(),
      z.object({
        label: z
          .string()
          .describe("Display label for entity type (e.g., 'Essay')"),
        pluralName: z
          .string()
          .optional()
          .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
        layout: z
          .string()
          .optional()
          .describe(
            "Layout name for this entity type's generated routes (defaults to 'default')",
          ),
        paginate: z
          .boolean()
          .optional()
          .describe("Enable pagination for list pages"),
        pageSize: z
          .number()
          .optional()
          .describe("Items per page (default: 10)"),
        navigation: z
          .object({
            show: z.boolean().optional().describe("Show in navigation"),
            slot: z
              .enum(NavigationSlots)
              .optional()
              .describe("Navigation slot (primary or secondary)"),
            priority: z
              .number()
              .min(0)
              .max(100)
              .optional()
              .describe("Navigation priority (0-100)"),
          })
          .optional()
          .describe("Navigation settings for this entity type"),
      }),
    )
    .optional()
    .describe(
      "Display metadata per entity type — label, plural name, layout, pagination, navigation slot. Consulted when auto-generating routes for active entity plugins.",
    ),
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
