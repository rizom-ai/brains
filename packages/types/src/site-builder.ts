import { z } from "zod";
import type { ProgressCallback } from "@brains/utils";
import type { ComponentType } from "./plugin";

/**
 * Section definition schema
 */
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  layout: z.string(),
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
 * Page definition schema
 */
export const PageDefinitionSchema = z.object({
  path: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(SectionDefinitionSchema),
  pluginId: z.string().optional(),
});

/**
 * Layout definition schema
 */
export const LayoutDefinitionSchema = z.object({
  name: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime
  component: z.union([z.function(), z.string()]), // Component function or path
  description: z.string().optional(),
});

// Type exports
export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;
export type PageDefinition = z.infer<typeof PageDefinitionSchema>;

// Manually define LayoutDefinition to use ComponentType
export interface LayoutDefinition {
  name: string;
  schema: z.ZodType<unknown>;
  component: ComponentType | string;
  description?: string;
}

/**
 * Site builder options
 */
export const SiteBuilderOptionsSchema = z.object({
  enableContentGeneration: z.boolean().default(false),
  outputDir: z.string(),
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
  pagesBuilt: z.number(),
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
 * Page registry interface
 */
export interface PageRegistry {
  register(page: PageDefinition): void;
  unregister(path: string): void;
  get(path: string): PageDefinition | undefined;
  list(): PageDefinition[];
}

/**
 * Layout registry interface
 */
export interface LayoutRegistry {
  register(layout: LayoutDefinition): void;
  unregister(name: string): void;
  get(name: string): LayoutDefinition | undefined;
  list(): LayoutDefinition[];
  validate(layoutName: string, content: unknown): boolean;
}

/**
 * Site builder interface
 */
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
  getPageRegistry(): PageRegistry;
  getLayoutRegistry(): LayoutRegistry;
}
