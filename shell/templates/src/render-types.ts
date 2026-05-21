import { z } from "@brains/utils";
import type { ProgressCallback } from "@brains/utils";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ComponentType, RuntimeScript } from "./types";

/**
 * Site content entity types
 */
export const SiteContentEntityTypeSchema = z.enum([
  "site-content-preview",
  "site-content-production",
]);
export type SiteContentEntityType = z.infer<typeof SiteContentEntityTypeSchema>;

/**
 * Renderer output formats supported by view templates.
 */
export const OutputFormatSchema = z.enum(["web", "image", "pdf"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

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
    image: z.union([z.function(), z.string()]).optional(),
    pdf: z.union([z.function(), z.string()]).optional(),
  }),
});

/**
 * Renderer types for different output formats
 */
export type WebRenderer<T = unknown> = ComponentType<T> | string;
export type ImageRenderer<T = unknown> = ComponentType<T> | string;
export type PdfRenderer<T = unknown> = ComponentType<T> | string;
export type MediaRenderer<T = unknown> = ImageRenderer<T> | PdfRenderer<T>;
export type Renderer<T = unknown> = WebRenderer<T> | MediaRenderer<T>;

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
    image?: ImageRenderer<T>;
    pdf?: PdfRenderer<T>;
  };

  // When true, render without any page layout shell (no header/footer)
  fullscreen?: boolean;

  // Content source information (preserved from ContentTemplate)
  providerId?: string; // For provider-based data fetching
  formatter?: ContentFormatter<T>; // For parsing stored content

  /** Runtime script dependencies (see Template.runtimeScripts). */
  runtimeScripts?: RuntimeScript[];
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
