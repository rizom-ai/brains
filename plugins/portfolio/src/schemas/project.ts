import { z } from "zod";
import { baseEntitySchema } from "@brains/plugins";

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
 * Project metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const projectMetadataSchema = projectFrontmatterSchema
  .pick({
    title: true,
    status: true,
    publishedAt: true,
    year: true,
  })
  .extend({
    // slug is required in metadata (auto-generated from title if not in frontmatter)
    slug: z.string(),
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
