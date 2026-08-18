import { z } from "@brains/utils/zod";
import {
  blogPostStatusSchema,
  type BlogPostStatus,
} from "../schemas/blog-post";

// The schemas are the source of truth; every type here is derived from one
// with z.output. That also gives the rendered shapes the implicit index
// signature JsonObject requires, which a hand-written interface would not
// have.

type Visibility = "public" | "shared" | "restricted";

const nullableString = (): z.ZodType<
  string | null,
  string | null | undefined
> => z.string().nullable().default(null);
const nullableNumber = (): z.ZodType<
  number | null,
  number | null | undefined
> => z.number().nullable().default(null);

const visibilitySchema: z.ZodType<
  Visibility,
  Visibility | "private" | undefined
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const metadataSchema: z.ZodType<{
  title: string;
  status: BlogPostStatus;
  publishedAt: string | null;
  seriesName: string | null;
  seriesIndex: number | null;
  slug: string;
  error: string | null;
}> = z.object({
  title: z.string(),
  status: blogPostStatusSchema,
  publishedAt: nullableString(),
  seriesName: nullableString(),
  seriesIndex: nullableNumber(),
  slug: z.string(),
  error: nullableString(),
});

const frontmatterSchema: z.ZodType<{
  title: string;
  slug: string | null;
  status: BlogPostStatus;
  publishedAt: string | null;
  excerpt: string;
  author: string;
  coverImageId: string | null;
  ogImageId: string | null;
  seriesName: string | null;
  seriesIndex: number | null;
  ogImage: string | null;
  ogDescription: string | null;
  twitterCard: "summary" | "summary_large_image" | null;
  canonicalUrl: string | null;
  atprotoUri: string | null;
}> = z.object({
  title: z.string(),
  slug: nullableString(),
  status: blogPostStatusSchema,
  publishedAt: nullableString(),
  excerpt: z.string(),
  author: z.string(),
  coverImageId: nullableString(),
  ogImageId: nullableString(),
  seriesName: nullableString(),
  seriesIndex: nullableNumber(),
  ogImage: nullableString(),
  ogDescription: nullableString(),
  twitterCard: z
    .enum(["summary", "summary_large_image"])
    .nullable()
    .default(null),
  canonicalUrl: nullableString(),
  atprotoUri: nullableString(),
});

export type BlogViewMetadata = z.output<typeof metadataSchema>;
export type BlogViewFrontmatter = z.output<typeof frontmatterSchema>;

export const blogViewSchema: z.ZodType<{
  id: string;
  entityType: "post";
  content: string;
  created: string;
  updated: string;
  visibility: Visibility;
  metadata: BlogViewMetadata;
  contentHash: string;
  frontmatter: BlogViewFrontmatter;
  body: string;
  url: string | null;
  typeLabel: string | null;
  listUrl: string | null;
  listLabel: string | null;
  seriesUrl: string | null;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  coverImageWidth: number | null;
  coverImageHeight: number | null;
  coverImageSrcset: string | null;
  coverImageSizes: string | null;
}> = z.object({
  id: z.string(),
  entityType: z.literal("post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  url: nullableString(),
  typeLabel: nullableString(),
  listUrl: nullableString(),
  listLabel: nullableString(),
  seriesUrl: nullableString(),
  coverImageUrl: nullableString(),
  ogImageUrl: nullableString(),
  coverImageWidth: nullableNumber(),
  coverImageHeight: nullableNumber(),
  coverImageSrcset: nullableString(),
  coverImageSizes: nullableString(),
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
