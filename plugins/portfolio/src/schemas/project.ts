import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Project frontmatter schema (stored in content as YAML frontmatter)
 * Contains all project data for human editing
 */
export const projectFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  description: z.string(), // 1-2 sentence summary for cards
  year: z.number(), // Year project began, used for ordering
  coverImageId: z.string().optional(), // References an image entity by ID
  technologies: z.array(z.string()).optional(),
  url: z.string().url().optional(), // Link to live project
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;

/**
 * Project metadata schema (duplicates key searchable fields from frontmatter)
 * Used for fast filtering without parsing content
 */
export const projectMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(), // Required in metadata for fast slug-based queries
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  year: z.number(),
});

export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

/**
 * Project entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + structured body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const projectSchema = baseEntitySchema.extend({
  entityType: z.literal("project"),
  metadata: projectMetadataSchema,
});

export type Project = z.infer<typeof projectSchema>;

/**
 * Structured content schema for project body
 * Parsed from markdown sections using StructuredContentFormatter
 */
export const projectContentSchema = z.object({
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

export type ProjectContent = z.infer<typeof projectContentSchema>;

/**
 * Project with parsed data (returned by datasource)
 * Extends Project with parsed frontmatter, body, and structured content
 * coverImageUrl is resolved from coverImageId and contains the actual image data URL
 */
export const projectWithDataSchema = projectSchema.extend({
  frontmatter: projectFrontmatterSchema,
  body: z.string(),
  structuredContent: projectContentSchema.optional(),
  coverImageUrl: z.string().optional(), // Resolved data URL from coverImageId
});

export type ProjectWithData = z.infer<typeof projectWithDataSchema>;

/**
 * Enriched project schema (used for validation)
 * url and typeLabel are optional to allow validation before enrichment
 */
export const enrichedProjectSchema = projectWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
});

/**
 * Template project schema (used for template validation)
 * url and typeLabel are required - always present after enrichment
 */
export const templateProjectSchema = projectWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
});

/**
 * Enriched project type (used by components)
 * url and typeLabel are required - always present after enrichment
 */
export type EnrichedProject = z.infer<typeof templateProjectSchema>;
