import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";

/**
 * Project status
 */
export const projectStatusSchema: z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  published: "published";
  failed: "failed";
}> = z.enum(["generating", "draft", "published", "failed"]);

export type ProjectStatus = z.output<typeof projectStatusSchema>;

type ProjectFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
  status: typeof projectStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  description: z.ZodString;
  year: z.ZodNumber;
  coverImageId: z.ZodOptional<z.ZodString>;
  ogImageId: z.ZodOptional<z.ZodString>;
  url: z.ZodOptional<z.ZodString>;
}>;

/**
 * Project frontmatter schema (stored in content as YAML frontmatter)
 * Contains all project data for human editing
 */
export const projectFrontmatterSchema: ProjectFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  status: projectStatusSchema,
  publishedAt: z.string().datetime().optional(),
  description: z.string(), // 1-2 sentence summary for cards
  year: z.number(), // Year project began, used for ordering
  coverImageId: z.string().optional(), // References an image entity by ID
  ogImageId: z.string().optional(), // References an image entity for social previews
  url: z.string().url().optional(), // Link to live project
});

export type ProjectFrontmatter = z.output<typeof projectFrontmatterSchema>;

type ProjectMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  status: typeof projectStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  description: z.ZodString;
  year: z.ZodNumber;
  coverImageId: z.ZodOptional<z.ZodString>;
  ogImageId: z.ZodOptional<z.ZodString>;
  url: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
  authoredSlug: z.ZodOptional<z.ZodBoolean>;
}>;

/**
 * A project's metadata: its frontmatter, decoded, with the slug resolved
 * from the title when the file states none, and the error a failed
 * generation recorded. Bookkeeping Studio and the vault leave out: the
 * error, and whether the file states its slug, so a stated slug stays where
 * the file states it and a resolved one is written after the other fields,
 * as the project adapter wrote them.
 */
export const projectMetadataSchema: ProjectMetadataSchema =
  projectFrontmatterSchema.extend({
    slug: z.string(),
    error: z.string().optional().meta({ studioWidget: "hidden" }),
    authoredSlug: z.boolean().optional().meta({ studioWidget: "hidden" }),
  });

export type ProjectMetadata = z.output<typeof projectMetadataSchema>;

/**
 * Project entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + structured body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const projectSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"project">;
    metadata: ProjectMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("project"),
  metadata: projectMetadataSchema,
});

export type Project = z.output<typeof projectSchema>;

type ProjectContentSchema = z.ZodObject<{
  context: z.ZodString;
  problem: z.ZodString;
  solution: z.ZodString;
  outcome: z.ZodString;
}>;

/**
 * Structured content schema for project body
 * Parsed from markdown sections using StructuredContentFormatter
 */
export const projectContentSchema: ProjectContentSchema = z.object({
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

export type ProjectContent = z.output<typeof projectContentSchema>;

/**
 * Project with parsed data (returned by datasource)
 * Extends Project with parsed frontmatter, body, and structured content
 * coverImageUrl is resolved from coverImageId and contains the actual image data URL
 */
export const projectWithDataSchema: ReturnType<
  typeof projectSchema.extend<{
    frontmatter: ProjectFrontmatterSchema;
    body: z.ZodString;
    structuredContent: z.ZodOptional<ProjectContentSchema>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
  }>
> = projectSchema.extend({
  frontmatter: projectFrontmatterSchema,
  body: z.string(),
  structuredContent: projectContentSchema.optional(),
  coverImageUrl: z.string().optional(), // Resolved data URL from coverImageId
  ogImageUrl: z.string().optional(), // Absolute URL for social preview metadata
});

export type ProjectWithData = z.output<typeof projectWithDataSchema>;

/**
 * Enriched project schema (used for validation)
 * url and typeLabel are optional to allow validation before enrichment
 */
export const enrichedProjectSchema: ReturnType<
  typeof projectWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
  }>
> = projectWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Template project schema (used for template validation)
 * url and typeLabel are required - always present after enrichment
 */
export const templateProjectSchema: ReturnType<
  typeof projectWithDataSchema.extend<{
    url: z.ZodString;
    typeLabel: z.ZodString;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
  }>
> = projectWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Enriched project type (used by components)
 * url and typeLabel are required - always present after enrichment
 */
export type EnrichedProject = z.output<typeof templateProjectSchema>;
