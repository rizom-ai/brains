import {
  renderedLinkFields,
  viewLinkFields,
  entityViewFields,
  type EntityViewFields,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { deckStatusSchema } from "../schemas/deck";

const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  author: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof deckStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  event: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  slug: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  status: deckStatusSchema,
  publishedAt: z.string().nullable().default(null),
  event: z.string().nullable().default(null),
  coverImageId: z.string().nullable().default(null),
  ogImageId: z.string().nullable().default(null),
});

const metadataSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof deckStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  slug: z.ZodString;
  error: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  status: deckStatusSchema,
  publishedAt: z.string().nullable().default(null),
  coverImageId: z.string().nullable().default(null),
  slug: z.string(),
  error: z.string().nullable().default(null),
});

export const deckViewSchema: z.ZodObject<
  EntityViewFields<"deck", typeof metadataSchema, typeof frontmatterSchema> & {
    body: z.ZodString;
  } & typeof viewLinkFields & {
      coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      ogImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      coverImageWidth: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
      coverImageHeight: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }
> = z.object({
  ...entityViewFields("deck", metadataSchema, frontmatterSchema),
  body: z.string(),
  ...viewLinkFields,
  coverImageUrl: z.string().nullable().default(null),
  ogImageUrl: z.string().nullable().default(null),
  coverImageWidth: z.number().nullable().default(null),
  coverImageHeight: z.number().nullable().default(null),
});

export type DeckSchemaData = z.output<typeof deckViewSchema>;

/**
 * A deck once site-builder has filled its link fields; components read them
 * as required, so the render path parses against this.
 */
export const deckRenderSchema: ReturnType<
  typeof deckViewSchema.extend<typeof renderedLinkFields>
> = deckViewSchema.extend(renderedLinkFields);

export type DeckView = z.output<typeof deckRenderSchema>;
