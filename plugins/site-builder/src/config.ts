import { z } from "@brains/utils";
import type { Template } from "@brains/plugins";
import { RouteDefinitionSchema, NavigationSlots } from "./types/routes";
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
export type EntityRouteConfig = Record<
  string,
  {
    label: string;
    pluralName?: string;
    /** Enable pagination for list pages */
    paginate?: boolean;
    /** Items per page (default: 10) */
    pageSize?: number;
    /** Navigation settings (show, slot, priority) */
    navigation?: {
      show?: boolean;
      slot?: (typeof NavigationSlots)[number];
      priority?: number;
    };
  }
>;

export const siteBuilderConfigSchema = z.object({
  previewOutputDir: z
    .string()
    .optional()
    .describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .describe("Output directory for production builds")
    .default("./dist/site-production"),
  previewUrl: z
    .string()
    .optional()
    .describe(
      "Base URL for preview/staging environment (e.g., https://preview.example.com)",
    ),
  productionUrl: z
    .string()
    .optional()
    .describe(
      "Base URL for production environment (e.g., https://example.com)",
    ),
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
    .describe("Layout components (at least 'default' required)"),
  autoRebuild: z
    .boolean()
    .default(true)
    .describe("Automatically rebuild site when content changes"),
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
});

export type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema> & {
  // Override the templates field type to be properly typed
  templates?: Record<string, Template>;
  // Override the layouts field type to be properly typed (required)
  layouts: Record<string, LayoutComponent>;
  // Override the entityRouteConfig field type to be properly typed
  entityRouteConfig?: EntityRouteConfig;
};
