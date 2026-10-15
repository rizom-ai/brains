import { z } from "@brains/utils/zod";
import { bookFrontmatterSchema, bookMetadataSchema } from "./book";
import {
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
} from "./book-section";

/**
 * What a page carries is what it shows. A site build holds every page's data
 * at once, so text a page does not render, carried on every page, grows with
 * the books' size times their sections.
 */

/** A book as its pages show it: its fields, never its text. */
export const bookFieldsSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"book">;
  metadata: typeof bookMetadataSchema;
  frontmatter: typeof bookFrontmatterSchema;
}> = z.object({
  id: z.string(),
  entityType: z.literal("book"),
  metadata: bookMetadataSchema,
  frontmatter: bookFrontmatterSchema,
});

export type BookFields = z.output<typeof bookFieldsSchema>;

/** A section as a link to it shows it: where it is, its title and siglum. */
export const bookSectionLinkSchema: z.ZodObject<{
  slug: z.ZodString;
  title: z.ZodString;
  section: z.ZodNullable<z.ZodString>;
}> = z.object({
  slug: z.string(),
  title: z.string(),
  section: z.string().nullable(),
});

export type BookSectionLink = z.output<typeof bookSectionLinkSchema>;

/** A section set for reading: its fields and its text, once. */
export const bookSectionReadingSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"book-section">;
  metadata: typeof bookSectionMetadataSchema;
  frontmatter: typeof bookSectionFrontmatterSchema;
  body: z.ZodString;
}> = z.object({
  id: z.string(),
  entityType: z.literal("book-section"),
  metadata: bookSectionMetadataSchema,
  frontmatter: bookSectionFrontmatterSchema,
  body: z.string(),
});

export type BookSectionReading = z.output<typeof bookSectionReadingSchema>;

/** A topic near a section. */
export const themeSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
}> = z.object({ id: z.string(), title: z.string() });

export type Theme = z.output<typeof themeSchema>;

/** One section in a book's score: enough to draw and link it. */
export const scoreEntrySchema: z.ZodObject<{
  slug: z.ZodString;
  title: z.ZodString;
  section: z.ZodNullable<z.ZodString>;
  order: z.ZodNumber;
  headings: z.ZodArray<z.ZodString>;
  length: z.ZodNumber;
}> = z.object({
  slug: z.string(),
  title: z.string(),
  section: z.string().nullable(),
  order: z.number().int(),
  /** The headings the section stands under, outermost first. */
  headings: z.array(z.string()),
  /** Bytes of the section's text. */
  length: z.number().int().min(0),
});

export type ScoreEntry = z.output<typeof scoreEntrySchema>;

/** A book's title page. */
export const bookDetailPageSchema: z.ZodObject<{
  book: typeof bookFieldsSchema;
  first: z.ZodNullable<typeof bookSectionLinkSchema>;
  score: z.ZodArray<typeof scoreEntrySchema>;
}> = z.object({
  book: bookFieldsSchema,
  /** Where reading begins; null for a book without sections. */
  first: bookSectionLinkSchema.nullable(),
  /** Every section in reading order. */
  score: z.array(scoreEntrySchema),
});

export type BookDetailPage = z.output<typeof bookDetailPageSchema>;

/** A section's page. */
export const bookSectionPageSchema: z.ZodObject<{
  section: typeof bookSectionReadingSchema;
  book: typeof bookFieldsSchema;
  prev: z.ZodNullable<typeof bookSectionLinkSchema>;
  next: z.ZodNullable<typeof bookSectionLinkSchema>;
  position: z.ZodNumber;
  total: z.ZodNumber;
  themes: z.ZodArray<typeof themeSchema>;
}> = z.object({
  section: bookSectionReadingSchema,
  book: bookFieldsSchema,
  prev: bookSectionLinkSchema.nullable(),
  next: bookSectionLinkSchema.nullable(),
  /** The section's place among the book's sections, from 1. */
  position: z.number().int().min(1),
  /** Sections in the book. */
  total: z.number().int().min(0),
  /** The topics nearest the section. */
  themes: z.array(themeSchema),
});

export type BookSectionPage = z.output<typeof bookSectionPageSchema>;
