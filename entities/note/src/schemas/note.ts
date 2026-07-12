import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Note frontmatter schema (optional in markdown)
 * Title is optional - falls back to H1 heading or filename
 */
export type NoteStatus = "generating" | "failed";

export const noteStatusSchema: z.ZodType<NoteStatus, NoteStatus> = z.enum([
  "generating",
  "failed",
]);

const noteStatusParserSchema: z.ZodType<NoteStatus, NoteStatus> = z.enum([
  "generating",
  "failed",
]);

export const noteFrontmatterSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<z.ZodType<NoteStatus, NoteStatus>>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string().optional(),
  status: noteStatusSchema.optional(),
  error: z.string().optional(),
});

export type NoteFrontmatter = z.output<typeof noteFrontmatterSchema>;

/**
 * Note metadata schema - derived from frontmatter
 * Title is required in metadata (derived from frontmatter, H1, or filename)
 */
export const noteMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  status: z.ZodOptional<z.ZodType<NoteStatus, NoteStatus>>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string(),
  status: noteStatusSchema.optional(),
  error: z.string().optional(),
});

export type NoteMetadata = z.output<typeof noteMetadataSchema>;

const noteEntityMetadataParserSchema: z.ZodObject<{
  title: z.ZodString;
  status: z.ZodOptional<z.ZodType<NoteStatus, NoteStatus>>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string(),
  status: noteStatusParserSchema.optional(),
  error: z.string().optional(),
});

/**
 * Note entity schema (extends BaseEntity)
 * Content field contains markdown with optional frontmatter
 */
export const noteSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"note">;
    metadata: typeof noteEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("note"),
  metadata: noteEntityMetadataParserSchema,
});

export type Note = z.output<typeof noteSchema>;

/**
 * Note with parsed data (returned by datasource if needed later)
 */
export const noteWithDataSchema: ReturnType<
  typeof noteSchema.extend<{
    frontmatter: typeof noteFrontmatterSchema;
    body: z.ZodString;
  }>
> = noteSchema.extend({
  frontmatter: noteFrontmatterSchema,
  body: z.string(),
});

export type NoteWithData = z.output<typeof noteWithDataSchema>;
