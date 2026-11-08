import { z } from "@brains/sdk/entities";

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;

export const docFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  description: NullableStringSchema;
  slug: NullableStringSchema;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
});

export type DocFrontmatter = z.output<typeof docFrontmatterSchema>;

/**
 * A doc's metadata: its frontmatter, decoded, with the slug resolved — the
 * authored one, or the slugified title. Studio edits it as it edited the
 * frontmatter: the slug as an optional field, and whether the file states
 * its slug hidden, so a stated slug stays in the file as written, even one
 * that equals the title's.
 */
export const docMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  description: NullableStringSchema;
  slug: NullableStringSchema;
  authoredSlug: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
  authoredSlug: z.boolean().optional().meta({ studioWidget: "hidden" }),
});

export type DocMetadata = z.output<typeof docMetadataSchema>;

/** A doc as the templates read it: its record, its frontmatter and its body. */
export const docWithDataSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"doc">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: z.ZodEnum<{
    public: "public";
    shared: "shared";
    restricted: "restricted";
  }>;
  metadata: z.ZodObject<{
    title: z.ZodString;
    section: z.ZodString;
    order: z.ZodNumber;
    description: NullableStringSchema;
    slug: z.ZodString;
  }>;
  contentHash: z.ZodString;
  frontmatter: typeof docFrontmatterSchema;
  body: z.ZodString;
}> = z.object({
  id: z.string(),
  entityType: z.literal("doc"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  metadata: z.object({
    title: z.string(),
    section: z.string(),
    order: z.number().int(),
    description: z.string().nullable().default(null),
    slug: z.string(),
  }),
  contentHash: z.string(),
  frontmatter: docFrontmatterSchema,
  body: z.string(),
});

export type DocWithData = z.output<typeof docWithDataSchema>;
