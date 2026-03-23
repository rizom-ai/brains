import { z } from "@brains/utils";
import type { Template } from "@brains/plugins";
import {
  RouteDefinitionSchema,
  NavigationSlots,
  type RouteDefinitionInput,
} from "@brains/plugins";
import { siteInfoBodySchema } from "./services/site-info-schema";

/**
 * Configuration schema for the site builder plugin
 */
import type { ComponentChildren, JSX } from "preact";

import type { SiteInfo } from "./types/site-info";
import type { UISlotRegistry } from "./lib/ui-slot-registry";

/**
 * Type alias for layout slots - uses the UISlotRegistry directly
 * Layouts can use this to render plugin-registered components
 */
export type LayoutSlots = UISlotRegistry;

// Layout component type - accepts JSX sections and returns JSX
export type LayoutComponent = (props: {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
  /** Optional slots for plugin-registered UI components */
  slots?: LayoutSlots;
}) => JSX.Element;

/**
 * Entity route configuration
 * Allows customizing auto-generated route paths and labels for entity types
 */
import type { EntityRouteEntry } from "@brains/plugins";
export type { EntityRouteEntry };
export type EntityRouteConfig = Record<string, EntityRouteEntry>;

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
  siteInfo: siteInfoBodySchema.default({
    title: "Personal Brain",
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
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  layouts: z
    .record(z.any())
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
  entityRouteConfig: z
    .record(
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
            "Layout name for this entity type's routes (defaults to 'default')",
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
      "Custom route configuration for entity types (overrides auto-generated paths and labels)",
    ),
  cms: z
    .object({})
    .optional()
    .describe(
      "Sveltia CMS configuration (enables /admin/ CMS, requires git-sync plugin)",
    ),
});

/** Zod-inferred parsed config — serializable fields only. */
type SiteBuilderSchemaConfig = z.infer<typeof siteBuilderConfigSchema>;

/**
 * Full site-builder config with properly typed runtime fields.
 *
 * Several fields use z.any() in the Zod schema because they carry
 * runtime objects (components, templates) that can't be validated.
 * We Omit those fields from the inferred type and re-declare them
 * with their real TypeScript types.
 */
export type SiteBuilderConfig = Omit<
  SiteBuilderSchemaConfig,
  "templates" | "layouts" | "routes" | "entityRouteConfig"
> & {
  templates?: Record<string, Template>;
  layouts?: Record<string, LayoutComponent>;
  routes?: RouteDefinitionInput[];
  entityRouteConfig?: EntityRouteConfig;
};
