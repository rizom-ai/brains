import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;

export const bookLicenseSchema: z.ZodEnum<{
  "public-domain": "public-domain";
  "CC-BY-SA-4.0": "CC-BY-SA-4.0";
  "CC-BY-NC-ND-4.0": "CC-BY-NC-ND-4.0";
}> = z.enum(["public-domain", "CC-BY-SA-4.0", "CC-BY-NC-ND-4.0"]);

export const bookKindSchema: z.ZodEnum<{
  work: "work";
  nachlass: "nachlass";
  letters: "letters";
  excerpt: "excerpt";
}> = z.enum(["work", "nachlass", "letters", "excerpt"]);

/** A book: the work as printed, with its edition and its measure. */
export const bookFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  source: z.ZodURL;
  author: NullableStringSchema;
  year: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  kind: z.ZodDefault<z.ZodNullable<typeof bookKindSchema>>;
  edition: NullableStringSchema;
  license: z.ZodDefault<z.ZodNullable<typeof bookLicenseSchema>>;
  attribution: NullableStringSchema;
  published: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
  length: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  sections: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  shortTitle: NullableStringSchema;
}> = z.object({
  title: z.string(),
  source: z.url(),
  author: z.string().nullable().default(null),
  year: z.number().int().nullable().default(null),
  kind: bookKindSchema.nullable().default(null),
  edition: z.string().nullable().default(null),
  license: bookLicenseSchema.nullable().default(null),
  attribution: z.string().nullable().default(null),
  /** Published in the author's lifetime, including private prints. */
  published: z.boolean().nullable().default(null),
  /** Bytes of the book's text, summed over its sections. */
  length: z.number().int().min(0).nullable().default(null),
  sections: z.number().int().min(0).nullable().default(null),
  /** A title short enough for a book's spine. */
  shortTitle: z.string().nullable().default(null),
});

export type BookFrontmatter = z.output<typeof bookFrontmatterSchema>;

export const bookMetadataSchema: z.ZodObject<{
  title: z.ZodString;
}> = z.object({
  title: z.string(),
});

export type BookMetadata = z.output<typeof bookMetadataSchema>;

export const bookSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"book">;
    metadata: typeof bookMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("book"),
  metadata: bookMetadataSchema,
});

export type Book = z.output<typeof bookSchema>;

export const bookWithDataSchema: ReturnType<
  typeof bookSchema.extend<{
    frontmatter: typeof bookFrontmatterSchema;
    body: z.ZodString;
  }>
> = bookSchema.extend({
  frontmatter: bookFrontmatterSchema,
  body: z.string(),
});

export type BookWithData = z.output<typeof bookWithDataSchema>;
