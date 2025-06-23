import { z } from "zod";
import type { ProgressCallback } from "@brains/utils";
import type { ComponentType } from "./plugin";

/**
 * Section definition schema
 */
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  template: z.string(), // renamed from layout
  content: z.unknown().optional(),
  contentEntity: z
    .object({
      entityType: z.string(),
      template: z.string().optional(),
      query: z.record(z.unknown()).optional(),
    })
    .optional(),
  order: z.number().optional(),
});

/**
 * Route definition schema
 */
export const RouteDefinitionSchema = z.object({
  path: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(SectionDefinitionSchema),
  pluginId: z.string().optional(),
});

/**
 * View template schema
 */
export const ViewTemplateSchema = z.object({
  name: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime
  component: z.union([z.function(), z.string()]), // Component function or path
  description: z.string().optional(),
});

// Type exports
export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;
export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;

// Manually define ViewTemplate to use ComponentType
export interface ViewTemplate<T = unknown> {
  name: string;
  schema: z.ZodType<T>;
  component: ComponentType<T> | string;
  description?: string;
}

/**
 * Route registry interface
 */
export interface RouteRegistry {
  register(route: RouteDefinition): void;
  unregister(path: string): void;
  get(path: string): RouteDefinition | undefined;
  list(): RouteDefinition[];
}

/**
 * View template registry interface
 */
export interface ViewTemplateRegistry {
  register(template: ViewTemplate<unknown>): void;
  unregister(name: string): void;
  get(name: string): ViewTemplate<unknown> | undefined;
  list(): ViewTemplate<unknown>[];
  validate(templateName: string, content: unknown): boolean;
}

/**
 * View registry interface - combines routes and templates
 */
export interface ViewRegistry {
  // Route methods
  registerRoute(route: RouteDefinition): void;
  getRoute(path: string): RouteDefinition | undefined;
  listRoutes(): RouteDefinition[];

  // View template methods
  registerViewTemplate(template: ViewTemplate<unknown>): void;
  getViewTemplate(name: string): ViewTemplate<unknown> | undefined;
  listViewTemplates(): ViewTemplate<unknown>[];
  validateViewTemplate(templateName: string, content: unknown): boolean;
}

/**
 * Site builder options
 */
export const SiteBuilderOptionsSchema = z.object({
  enableContentGeneration: z.boolean().default(false),
  outputDir: z.string(),
  workingDir: z.string().optional(),
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
 * Content generation request
 */
export const ContentGenerationRequestSchema = z.object({
  pageId: z.string(),
  sectionId: z.string(),
  template: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export type ContentGenerationRequest = z.infer<
  typeof ContentGenerationRequestSchema
>;

/**
 * Site builder interface
 */
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
