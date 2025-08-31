import { z } from "@brains/utils";
import type { ProgressCallback, ContentFormatter } from "@brains/utils";
import type { ComponentType } from "@brains/templates";

/**
 * Zod schema for Template validation (used in plugin configurations)
 */
export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  requiredPermission: z.enum(["anchor", "trusted", "public"]),
  formatter: z.any().optional(), // ContentFormatter instance
  layout: z
    .object({
      component: z.any(), // ComponentType or string
      description: z.string().optional(),
      interactive: z.boolean().optional(),
      packageName: z.string().optional(),
    })
    .optional(),
});

/**
 * Site content entity types
 */
export const SiteContentEntityTypeSchema = z.enum([
  "site-content-preview",
  "site-content-production",
]);
export type SiteContentEntityType = z.infer<typeof SiteContentEntityTypeSchema>;

/**
 * View template schema
 */
export const ViewTemplateSchema = z.object({
  name: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime
  description: z.string().optional(),
  pluginId: z.string(),
  renderers: z.object({
    web: z.union([z.function(), z.string()]).optional(),
    // Future formats can be added here
  }),
  interactive: z.boolean(),
});

/**
 * Renderer types for different output formats
 */
export type WebRenderer<T = unknown> = ComponentType<T> | string;
// Future: export type PDFRenderer<T = unknown> = ...
// Future: export type EmailRenderer<T = unknown> = ...

/**
 * Output format types
 */
export type OutputFormat = "web"; // | 'pdf' | 'email' in future

/**
 * View template with support for multiple output formats
 */
export interface ViewTemplate<T = unknown> {
  name: string;
  schema: z.ZodType<T>;
  description?: string;
  pluginId: string; // ID of the plugin that registered this template

  // Format-specific renderers
  renderers: {
    web?: WebRenderer<T>;
    // Future formats can be added here
    // pdf?: PDFRenderer<T>;
    // email?: EmailRenderer<T>;
  };

  // Mark components that need client-side hydration
  interactive: boolean;

  // Content source information (preserved from ContentTemplate)
  providerId?: string; // For provider-based data fetching
  formatter?: ContentFormatter<T>; // For parsing stored content
}

/**
 * View template registry interface
 */
export interface ViewTemplateRegistry {
  get(name: string): ViewTemplate<unknown> | undefined;
  list(): ViewTemplate<unknown>[];
  validate(templateName: string, content: unknown): boolean;
}

/**
 * Site builder options
 */
export const SiteBuilderOptionsSchema = z.object({
  enableContentGeneration: z.boolean().default(false),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  environment: z.enum(["preview", "production"]).default("preview"),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
    })
    .optional(),
});

export type SiteBuilderOptions = z.infer<typeof SiteBuilderOptionsSchema>;

/**
 * Build result schema
 */
export const BuildResultSchema = z.object({
  success: z.boolean(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export type BuildResult = z.infer<typeof BuildResultSchema>;

/**
 * Site builder interface
 */
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
