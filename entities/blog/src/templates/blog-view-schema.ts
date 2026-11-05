import { entityViewFields, type EntityViewFields } from "@brains/plugins";
import { renderedLinkFields, viewLinkFields } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { blogPostStatusSchema } from "../schemas/blog-post";

const nullableString: z.ZodDefault<z.ZodNullable<z.ZodString>> = z
  .string()
  .nullable()
  .default(null);
const nullableNumber: z.ZodDefault<z.ZodNullable<z.ZodNumber>> = z
  .number()
  .nullable()
  .default(null);

const metadataSchema: z.ZodObject<{
  title: z.ZodString;
  status: typeof blogPostStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  seriesName: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  seriesIndex: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  slug: z.ZodString;
  error: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  status: blogPostStatusSchema,
  publishedAt: nullableString,
  seriesName: nullableString,
  seriesIndex: nullableNumber,
  slug: z.string(),
  error: nullableString,
});

const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof blogPostStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  excerpt: z.ZodString;
  author: z.ZodString;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  seriesName: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  seriesIndex: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  ogImage: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  canonicalUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  slug: nullableString,
  status: blogPostStatusSchema,
  publishedAt: nullableString,
  excerpt: z.string(),
  author: z.string(),
  coverImageId: nullableString,
  ogImageId: nullableString,
  seriesName: nullableString,
  seriesIndex: nullableNumber,
  ogImage: nullableString,
  canonicalUrl: nullableString,
});

export const blogViewSchema: z.ZodObject<
  EntityViewFields<"post", typeof metadataSchema, typeof frontmatterSchema> & {
    body: z.ZodString;
  } & typeof viewLinkFields & {
      seriesUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      ogImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      coverImageWidth: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
      coverImageHeight: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
      coverImageSrcset: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      coverImageSizes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }
> = z.object({
  ...entityViewFields("post", metadataSchema, frontmatterSchema),
  body: z.string(),
  ...viewLinkFields,
  seriesUrl: nullableString,
  coverImageUrl: nullableString,
  ogImageUrl: nullableString,
  coverImageWidth: nullableNumber,
  coverImageHeight: nullableNumber,
  coverImageSrcset: nullableString,
  coverImageSizes: nullableString,
});

export type BlogSchemaData = z.output<typeof blogViewSchema>;

export type BlogPostView = Omit<
  BlogSchemaData,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};

/**
 * A post once site-builder has filled the link fields the datasource leaves
 * null. Components read them as required, so the render path parses against
 * this rather than trusting that the enrichment ran.
 */
export const blogRenderSchema: z.ZodType<BlogPostView> =
  blogViewSchema.extend(renderedLinkFields);
