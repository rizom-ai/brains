import { contentVisibilitySchema } from "@brains/plugins";
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
  ogDescription: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  twitterCard: z.ZodDefault<
    z.ZodNullable<
      z.ZodEnum<{
        summary: "summary";
        summary_large_image: "summary_large_image";
      }>
    >
  >;
  canonicalUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  atprotoUri: z.ZodDefault<z.ZodNullable<z.ZodString>>;
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
  ogDescription: nullableString,
  twitterCard: z
    .enum(["summary", "summary_large_image"])
    .nullable()
    .default(null),
  canonicalUrl: nullableString,
  atprotoUri: nullableString,
});

export const blogViewSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"post">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof contentVisibilitySchema;
  metadata: typeof metadataSchema;
  contentHash: z.ZodString;
  frontmatter: typeof frontmatterSchema;
  body: z.ZodString;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  typeLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  listUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  listLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  seriesUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageWidth: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  coverImageHeight: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  coverImageSrcset: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageSizes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  id: z.string(),
  entityType: z.literal("post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  url: nullableString,
  typeLabel: nullableString,
  listUrl: nullableString,
  listLabel: nullableString,
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
