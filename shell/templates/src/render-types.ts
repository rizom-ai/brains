import type { ProgressCallback } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ComponentType, RuntimeScript, TemplateDataSchema } from "./types";

/**
 * Site content entity types
 */
export type SiteContentEntityType =
  "site-content-preview" | "site-content-production";

export const SiteContentEntityTypeSchema: z.ZodType<SiteContentEntityType> =
  z.enum(["site-content-preview", "site-content-production"]);

/**
 * Renderer output formats supported by view templates.
 */
export type OutputFormat = "web" | "image" | "pdf";

export const OutputFormatSchema: z.ZodType<OutputFormat> = z.enum([
  "web",
  "image",
  "pdf",
]);

type RendererFunction = (...args: unknown[]) => unknown;

/**
 * Renderer types for different output formats
 */
export type WebRenderer<T = unknown> = ComponentType<T> | string;
export type ImageRenderer<T = unknown> = ComponentType<T> | string;
export type PdfRenderer<T = unknown> = ComponentType<T> | string;
export type MediaRenderer<T = unknown> = ImageRenderer<T> | PdfRenderer<T>;
export type Renderer<T = unknown> = WebRenderer<T> | MediaRenderer<T>;

export interface ViewTemplateSchemaOutput {
  name: string;
  schema: unknown;
  description?: string | undefined;
  pluginId: string;
  renderers: {
    web?: RendererFunction | string | undefined;
    image?: RendererFunction | string | undefined;
    pdf?: RendererFunction | string | undefined;
  };
}

/**
 * View template schema
 */
const rendererFunctionSchema: z.ZodType<RendererFunction> =
  z.custom<RendererFunction>((value) => typeof value === "function");

export const ViewTemplateSchema: z.ZodType<ViewTemplateSchemaOutput> = z.object(
  {
    name: z.string(),
    schema: z.any(), // ZodType can't be validated at runtime
    description: z.string().optional(),
    pluginId: z.string(),
    renderers: z.object({
      web: z.union([rendererFunctionSchema, z.string()]).optional(),
      image: z.union([rendererFunctionSchema, z.string()]).optional(),
      pdf: z.union([rendererFunctionSchema, z.string()]).optional(),
    }),
  },
);

/**
 * View template with support for multiple output formats
 */
export interface ViewTemplate<T = unknown> {
  name: string;
  schema: TemplateDataSchema<T>;
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

export interface SiteBuilderOptionsInput {
  enableContentGeneration?: boolean | undefined;
  outputDir: string;
  workingDir?: string | undefined;
  environment?: "preview" | "production" | undefined;
  siteConfig?:
    | {
        title: string;
        description: string;
        url?: string | undefined;
      }
    | undefined;
}

export interface SiteBuilderOptions {
  enableContentGeneration: boolean;
  outputDir: string;
  workingDir?: string | undefined;
  environment: "preview" | "production";
  siteConfig?:
    | {
        title: string;
        description: string;
        url?: string | undefined;
      }
    | undefined;
}

/**
 * Site builder options
 */
export const SiteBuilderOptionsSchema: z.ZodType<
  SiteBuilderOptions,
  SiteBuilderOptionsInput
> = z.object({
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

export interface BuildResult {
  success: boolean;
  routesBuilt: number;
  errors?: string[] | undefined;
  warnings?: string[] | undefined;
}

/**
 * Build result schema
 */
export const BuildResultSchema: z.ZodType<BuildResult> = z.object({
  success: z.boolean(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

/**
 * Site builder interface
 */
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
