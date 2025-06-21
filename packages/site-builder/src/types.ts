import { z } from "zod";
import type { ProgressCallback } from "@brains/utils";

// Schema for content entities that will be stored
export const ContentEntitySchema = z.object({
  id: z.string(),
  type: z.literal("site-content"),
  name: z.string(),
  sectionId: z.string(),
  pageId: z.string(),
  content: z.unknown(), // Validated by layout schema
  generatedAt: z.string().datetime().optional(),
  lastModified: z.string().datetime(),
});

export type ContentEntity = z.infer<typeof ContentEntitySchema>;

// Schema for layout definitions
export const LayoutDefinitionSchema = z.object({
  name: z.string(),
  schema: z.instanceof(z.ZodType), // Runtime validation schema
  component: z.string(), // Path to Astro component
  description: z.string().optional(),
});

export type LayoutDefinition = z.infer<typeof LayoutDefinitionSchema>;

// Schema for section definitions
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  layout: z.string(), // References layout name
  content: z.unknown().optional(), // Static content, validated by layout schema
  contentEntity: z
    .object({
      entityType: z.string().default("site-content"),
      template: z.string(), // AI generation template name (required)
      query: z.record(z.unknown()).optional(), // Query to find existing entity
    })
    .optional(),
});

export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;

// Schema for page definitions
export const PageDefinitionSchema = z.object({
  path: z.string().regex(/^\//, "Path must start with /"),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(SectionDefinitionSchema),
  pluginId: z.string(), // Required to track ownership
  metadata: z.record(z.unknown()).optional(),
});

export type PageDefinition = z.infer<typeof PageDefinitionSchema>;

// Registry interfaces
export interface PageRegistry {
  register(page: PageDefinition): void;
  unregister(path: string): void;
  get(path: string): PageDefinition | undefined;
  list(): PageDefinition[];
  listByPlugin(pluginId: string): PageDefinition[];
}

export interface LayoutRegistry {
  register(layout: LayoutDefinition): void;
  unregister(name: string): void;
  get(name: string): LayoutDefinition | undefined;
  list(): LayoutDefinition[];
  validate(layoutName: string, content: unknown): boolean;
}

// Site builder options
export const SiteBuilderOptionsSchema = z.object({
  outputDir: z.string(),
  baseUrl: z.string().optional(),
  enableContentGeneration: z.boolean().default(true),
});

export type SiteBuilderOptions = z.infer<typeof SiteBuilderOptionsSchema>;

// Build result
export interface BuildResult {
  success: boolean;
  pagesBuilt: number;
  errors?: string[];
  warnings?: string[];
}

// Content generation request
export interface ContentGenerationRequest {
  pageId: string;
  sectionId: string;
  template: string;
  context?: Record<string, unknown>;
}

// Site builder interface
export interface SiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
