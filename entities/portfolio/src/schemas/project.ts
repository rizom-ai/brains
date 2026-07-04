import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Project status
 */
export type ProjectStatus = "generating" | "draft" | "published" | "failed";

export const projectStatusSchema: z.ZodType<ProjectStatus, ProjectStatus> =
  z.enum(["generating", "draft", "published", "failed"]);

const projectStatusParserSchema: z.ZodType<ProjectStatus, ProjectStatus> =
  z.enum(["generating", "draft", "published", "failed"]);

export interface ProjectFrontmatter {
  [key: string]: unknown;
  title: string;
  slug?: string | undefined;
  status: ProjectStatus;
  publishedAt?: string | undefined;
  description: string;
  year: number;
  coverImageId?: string | undefined;
  ogImageId?: string | undefined;
  url?: string | undefined;
}

type ProjectFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
  status: z.ZodType<ProjectStatus, ProjectStatus>;
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

export interface ProjectMetadata {
  [key: string]: unknown;
  title: string;
  status: ProjectStatus;
  publishedAt?: string | undefined;
  year: number;
  slug: string;
  error?: string | undefined;
}

type ProjectMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodType<ProjectStatus, ProjectStatus>;
  publishedAt: z.ZodOptional<z.ZodString>;
  year: z.ZodNumber;
  slug: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
}>;

/**
 * Project metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const projectMetadataSchema: ProjectMetadataSchema =
  projectFrontmatterSchema
    .pick({
      title: true,
      status: true,
      publishedAt: true,
      year: true,
    })
    .extend({
      // slug is required in metadata (auto-generated from title if not in frontmatter)
      slug: z.string(),
      error: z.string().optional(),
    });

const projectEntityMetadataParserSchema: ProjectMetadataSchema = z.object({
  title: z.string(),
  status: projectStatusParserSchema,
  publishedAt: z.string().datetime().optional(),
  year: z.number(),
  slug: z.string(),
  error: z.string().optional(),
});

const projectFrontmatterParserSchema: ProjectFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: projectStatusParserSchema,
  publishedAt: z.string().datetime().optional(),
  description: z.string(),
  year: z.number(),
  coverImageId: z.string().optional(),
  ogImageId: z.string().optional(),
  url: z.string().url().optional(),
});

export interface Project extends z.output<typeof baseEntityParserSchema> {
  entityType: "project";
  metadata: ProjectMetadata;
}

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
  metadata: projectEntityMetadataParserSchema,
});

export interface ProjectContent {
  context: string;
  problem: string;
  solution: string;
  outcome: string;
}

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

export interface ProjectWithData extends Project {
  frontmatter: ProjectFrontmatter;
  body: string;
  structuredContent?: ProjectContent | undefined;
  coverImageUrl?: string | undefined;
  ogImageUrl?: string | undefined;
}

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
  frontmatter: projectFrontmatterParserSchema,
  body: z.string(),
  structuredContent: projectContentSchema.optional(),
  coverImageUrl: z.string().optional(), // Resolved data URL from coverImageId
  ogImageUrl: z.string().optional(), // Absolute URL for social preview metadata
});

export interface ProjectEnrichment {
  url?: string | undefined;
  typeLabel?: string | undefined;
  coverImageUrl?: string | undefined;
  ogImageUrl?: string | undefined;
  coverImageWidth?: number | undefined;
  coverImageHeight?: number | undefined;
}

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
 * Enriched project type (used by components)
 * url and typeLabel are required - always present after enrichment
 */
export interface EnrichedProject extends ProjectWithData {
  url: string;
  typeLabel: string;
  coverImageUrl?: string | undefined;
  ogImageUrl?: string | undefined;
  coverImageWidth?: number | undefined;
  coverImageHeight?: number | undefined;
}

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
