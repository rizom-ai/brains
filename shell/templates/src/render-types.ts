import type { JsonObject } from "@brains/contracts";
import type { ProgressCallback } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ComponentType, RuntimeScript, TemplateDataSchema } from "./types";

/**
 * Site content entity types
 */
export const SiteContentEntityTypeSchema: z.ZodEnum<{
  "site-content-preview": "site-content-preview";
  "site-content-production": "site-content-production";
}> = z.enum(["site-content-preview", "site-content-production"]);

export type SiteContentEntityType = z.output<
  typeof SiteContentEntityTypeSchema
>;

/**
 * Renderer output formats supported by view templates.
 */
export const OutputFormatSchema: z.ZodEnum<{
  web: "web";
  image: "image";
  pdf: "pdf";
}> = z.enum(["web", "image", "pdf"]);

export type OutputFormat = z.output<typeof OutputFormatSchema>;

type RendererFunction = (...args: unknown[]) => unknown;

/**
 * Renderer types for different output formats
 */
export type WebRenderer<T = unknown> = ComponentType<T> | string;
export type ImageRenderer<T = unknown> = ComponentType<T> | string;
export type PdfRenderer<T = unknown> = ComponentType<T> | string;
export type MediaRenderer<T = unknown> = ImageRenderer<T> | PdfRenderer<T>;
export type Renderer<T = unknown> = WebRenderer<T> | MediaRenderer<T>;

/**
 * View template schema
 */
const rendererFunctionSchema: z.ZodCustom<RendererFunction, RendererFunction> =
  z.custom<RendererFunction>((value) => typeof value === "function");

type RendererSchema = z.ZodOptional<
  z.ZodUnion<readonly [typeof rendererFunctionSchema, z.ZodString]>
>;

export const ViewTemplateSchema: z.ZodObject<{
  name: z.ZodString;
  schema: z.ZodUnknown;
  description: z.ZodOptional<z.ZodString>;
  pluginId: z.ZodString;
  renderVersion: z.ZodOptional<z.ZodString>;
  renderers: z.ZodObject<{
    web: RendererSchema;
    image: RendererSchema;
    pdf: RendererSchema;
  }>;
}> = z.object({
  name: z.string(),
  schema: z.unknown(), // ZodType can't be validated at runtime
  description: z.string().optional(),
  pluginId: z.string(),
  renderVersion: z.string().min(1).optional(),
  renderers: z.object({
    web: z.union([rendererFunctionSchema, z.string()]).optional(),
    image: z.union([rendererFunctionSchema, z.string()]).optional(),
    pdf: z.union([rendererFunctionSchema, z.string()]).optional(),
  }),
});

export type ViewTemplateSchemaOutput = z.output<typeof ViewTemplateSchema>;

/**
 * View template with support for multiple output formats
 */
export interface ViewTemplate<T extends JsonObject = JsonObject> {
  name: string;
  schema: TemplateDataSchema<T>;
  description?: string;
  pluginId: string; // ID of the plugin that registered this template
  /** Stable author-owned version for output-affecting renderer behavior. */
  renderVersion?: string;

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

  /** Static files behind runtimeScripts srcs (see Template.staticAssets). */
  staticAssets?: Record<string, string>;
}

/**
 * View template registry interface
 */
/**
 * The render service as consumers use it.
 *
 * `hasRenderer` and `listFormats` were missing here even though callers use
 * both: consumers took the `RenderService` class instead, which meant a test
 * double had to be asserted into a type with private state.
 */
export interface ViewTemplateRegistry {
  get(name: string): ViewTemplate | undefined;
  list(): ViewTemplate[];
  validate(templateName: string, content: unknown): boolean;
  findViewTemplate(filter: {
    name?: string;
    pluginId?: string;
    namePattern?: string;
  }): ViewTemplate | undefined;
  getRenderer(templateName: string, format: OutputFormat): Renderer | undefined;
  hasRenderer(templateName: string, format: OutputFormat): boolean;
  listFormats(templateName: string): OutputFormat[];
}

/**
 * Site builder options
 */
export const SiteBuilderOptionsSchema: z.ZodObject<{
  enableContentGeneration: z.ZodDefault<z.ZodBoolean>;
  outputDir: z.ZodString;
  workingDir: z.ZodOptional<z.ZodString>;
  environment: z.ZodDefault<
    z.ZodEnum<{ preview: "preview"; production: "production" }>
  >;
  siteConfig: z.ZodOptional<
    z.ZodObject<{
      title: z.ZodString;
      description: z.ZodString;
      url: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
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

export type SiteBuilderOptions = z.output<typeof SiteBuilderOptionsSchema>;
export type SiteBuilderOptionsInput = z.input<typeof SiteBuilderOptionsSchema>;

/**
 * Build result schema
 */
export const BuildResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  routesBuilt: z.ZodNumber;
  errors: z.ZodOptional<z.ZodArray<z.ZodString>>;
  warnings: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  success: z.boolean(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export type BuildResult = z.output<typeof BuildResultSchema>;

/**
 * Site builder interface
 */
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
