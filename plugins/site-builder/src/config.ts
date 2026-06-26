import { z } from "@brains/utils/zod-v4";
import {
  NavigationSlots,
  type EntityDisplayEntry,
} from "@brains/site-composition";
import { siteBuilderSiteMetadataSchema } from "./types/site-metadata-schema";

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

const sectionDefinitionSchema = z.object({
  id: z.string(),
  template: z.string(),
  content: z.unknown().optional(),
  dataQuery: z
    .looseObject({
      entityType: z.string().optional(),
      template: z.string().optional(),
      query: z
        .looseObject({
          id: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  order: z.number().optional(),
});

const navigationMetadataSchema = z
  .object({
    show: z.boolean().default(false),
    label: z.string().optional(),
    slot: z.enum(NavigationSlots).default("primary"),
    priority: z.number().min(0).max(100).default(50),
  })
  .optional();

const routeDefinitionSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().default(""),
  pageLabel: z.string().optional(),
  description: z.string().default(""),
  sections: z.array(sectionDefinitionSchema).default([]),
  layout: z.string().default("default"),
  fullscreen: z.boolean().optional(),
  pluginId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  external: z.boolean().optional(),
  navigation: navigationMetadataSchema,
});

export const siteBuilderConfigSchema = z.object({
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
    .default("./.preact-work"),
  siteInfo: siteBuilderSiteMetadataSchema.default({
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
  templates: z.any().optional().describe("Template definitions to register"),
  routes: z
    .array(routeDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  layouts: z
    .record(z.string(), z.any())
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

/** Zod-inferred parsed config — serializable fields only. */
type SiteBuilderSchemaConfig = z.output<typeof siteBuilderConfigSchema>;

type SiteBuilderSchemaConfigInput = z.input<typeof siteBuilderConfigSchema>;

/**
 * Full site-builder config after defaults are applied.
 *
 * Several fields use z.any() in the Zod schema because they carry
 * runtime objects (components, templates) that can't be validated.
 */
export type SiteBuilderConfig = SiteBuilderSchemaConfig;

export type SiteBuilderConfigInput = SiteBuilderSchemaConfigInput & {
  entityDisplay?: EntityDisplayMap | undefined;
};
