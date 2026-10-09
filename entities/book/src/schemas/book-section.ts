import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;

/**
 * A section of a book: its text, its place in reading order, the citation
 * unit it is cited by, and the headings it stands under.
 */
export const bookSectionFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  book: z.ZodString;
  order: z.ZodNumber;
  section: NullableStringSchema;
  page: NullableStringSchema;
  headings: z.ZodDefault<z.ZodArray<z.ZodString>>;
  source: z.ZodURL;
}> = z.object({
  title: z.string(),
  book: z.string().min(1),
  /** Reading order within the book, from 1. */
  order: z.number().int().min(1),
  /** The citation unit: aphorism number, §, or edition siglum. */
  section: z.string().nullable().default(null),
  page: z.string().nullable().default(null),
  /**
   * The headings a section stands under, outermost first: a book's part, then
   * the division within it. Empty for a section directly under the book.
   */
  headings: z.array(z.string()).default([]),
  source: z.url(),
});

export type BookSectionFrontmatter = z.output<
  typeof bookSectionFrontmatterSchema
>;

export const bookSectionMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodNullable<z.ZodString>;
  book: z.ZodString;
  order: z.ZodNumber;
  slug: z.ZodString;
  pageTitle: z.ZodString;
}> = z.object({
  title: z.string(),
  section: z.string().nullable(),
  book: z.string(),
  order: z.number().int(),
  slug: z.string(),
  /** What a page and a search result call this section: its siglum, or its title. */
  pageTitle: z.string(),
});

export type BookSectionMetadata = z.output<typeof bookSectionMetadataSchema>;

export const bookSectionSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"book-section">;
    metadata: typeof bookSectionMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("book-section"),
  metadata: bookSectionMetadataSchema,
});

export type BookSection = z.output<typeof bookSectionSchema>;

export const bookSectionWithDataSchema: ReturnType<
  typeof bookSectionSchema.extend<{
    frontmatter: typeof bookSectionFrontmatterSchema;
    body: z.ZodString;
  }>
> = bookSectionSchema.extend({
  frontmatter: bookSectionFrontmatterSchema,
  body: z.string(),
});

export type BookSectionWithData = z.output<typeof bookSectionWithDataSchema>;
