import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Note frontmatter schema (optional in markdown)
 * Title is optional - falls back to H1 heading or filename
 */
export const noteFrontmatterSchema = z.object({
  title: z.string().optional(),
});

export type NoteFrontmatter = z.infer<typeof noteFrontmatterSchema>;

/**
 * Note metadata schema (in DB for fast queries)
 * Title is required - derived from frontmatter, H1, or filename
 */
export const noteMetadataSchema = z.object({
  title: z.string(),
});

export type NoteMetadata = z.infer<typeof noteMetadataSchema>;

/**
 * Note entity schema (extends BaseEntity)
 * Content field contains markdown with optional frontmatter
 */
export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  metadata: noteMetadataSchema,
});

export type Note = z.infer<typeof noteSchema>;

/**
 * Note with parsed data (returned by datasource if needed later)
 */
export const noteWithDataSchema = noteSchema.extend({
  frontmatter: noteFrontmatterSchema,
  body: z.string(),
});

export type NoteWithData = z.infer<typeof noteWithDataSchema>;
