import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Note frontmatter schema (optional in markdown)
 * Title is optional - falls back to a body H1 or first nonblank body line
 */
export const noteStatusSchema: z.ZodEnum<{
  generating: "generating";
  failed: "failed";
}> = z.enum(["generating", "failed"]);

export type NoteStatus = z.output<typeof noteStatusSchema>;

export const noteFrontmatterSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<typeof noteStatusSchema>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string().optional(),
  // Set by the generation that writes the note.
  status: noteStatusSchema.optional().meta({ studioWidget: "provenance" }),
  error: z.string().optional().meta({ studioWidget: "provenance" }),
});

export type NoteFrontmatter = z.output<typeof noteFrontmatterSchema>;

/**
 * Note metadata schema - derived from frontmatter
 * Title is required in metadata (frontmatter, body H1, body line, or Untitled).
 * Whether the file states its title is hidden bookkeeping: a note keeps a
 * stated title in its frontmatter and a derived one out of it, so a plain
 * note stays plain.
 */
export const noteMetadataSchema: z.ZodObject<{
  title: z.ZodDefault<z.ZodString>;
  status: z.ZodOptional<typeof noteStatusSchema>;
  error: z.ZodOptional<z.ZodString>;
  titleStated: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  // A file need not state its title: the note takes it from its body, so
  // a writer, Studio included, may leave it out.
  title: z.string().default("Untitled"),
  status: noteStatusSchema.optional(),
  error: z.string().optional(),
  titleStated: z.boolean().optional().meta({ studioWidget: "hidden" }),
});

export type NoteMetadata = z.output<typeof noteMetadataSchema>;

/**
 * Note entity schema (extends BaseEntity)
 * Content field contains markdown with optional frontmatter
 */
export const noteSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"note">;
    metadata: typeof noteMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("note"),
  metadata: noteMetadataSchema,
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
