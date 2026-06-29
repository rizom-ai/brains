import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Note frontmatter schema (optional in markdown)
 * Title is optional - falls back to H1 heading or filename
 */
export const noteStatusSchema = z.enum(["generating", "failed"]);
export type NoteStatus = z.output<typeof noteStatusSchema>;

const noteStatusParserSchema = z4.enum(["generating", "failed"]);

export const noteFrontmatterSchema = z.object({
  title: z.string().optional(),
  status: noteStatusSchema.optional(),
  error: z.string().optional(),
});

export type NoteFrontmatter = z.output<typeof noteFrontmatterSchema>;

/**
 * Note metadata schema - derived from frontmatter
 * Title is required in metadata (derived from frontmatter, H1, or filename)
 * Using .required() ensures all picked fields are non-optional
 */
export const noteMetadataSchema = noteFrontmatterSchema
  .pick({ title: true, status: true, error: true })
  .extend({ title: z.string() });

export type NoteMetadata = z.output<typeof noteMetadataSchema>;

const noteEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  status: noteStatusParserSchema.optional(),
  error: z4.string().optional(),
});

const noteFrontmatterParserSchema = z4.object({
  title: z4.string().optional(),
  status: noteStatusParserSchema.optional(),
  error: z4.string().optional(),
});

/**
 * Note entity schema (extends BaseEntity)
 * Content field contains markdown with optional frontmatter
 */
export const noteSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("note"),
  metadata: noteEntityMetadataParserSchema,
});

export type Note = z4.output<typeof noteSchema>;

/**
 * Note with parsed data (returned by datasource if needed later)
 */
export const noteWithDataSchema = noteSchema.extend({
  frontmatter: noteFrontmatterParserSchema,
  body: z4.string(),
});

export type NoteWithData = z4.output<typeof noteWithDataSchema>;
