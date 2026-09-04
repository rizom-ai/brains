import { z } from "@brains/sdk/entities";
import type { EnrichedSocialPost } from "../schemas/social-post";

const platformSchema = z.enum(["linkedin"]);
const statusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
const sourceEntityTypeSchema = z.enum(["post", "deck"]);
const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

const visibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const documentAttachmentSchema = z.object({ id: z.string().min(1) });
const frontmatterSchema = z.object({
  title: z.string(),
  platform: platformSchema,
  status: statusSchema,
  coverImageId: nullableString,
  documents: z.array(documentAttachmentSchema).nullable().default(null),
  publishedAt: nullableString,
  platformPostId: nullableString,
  sourceEntityId: nullableString,
  sourceEntityType: sourceEntityTypeSchema.nullable().default(null),
});
const metadataSchema = z.object({
  title: z.string(),
  platform: platformSchema,
  status: statusSchema,
  publishedAt: nullableString,
  platformPostId: nullableString,
  slug: z.string(),
  error: nullableString,
});

type JsonReady<T> = T extends undefined
  ? null
  : T extends readonly (infer Item)[]
    ? JsonReady<Item>[]
    : T extends object
      ? { [K in keyof T]-?: JsonReady<T[K]> }
      : T;

/** Datasource payload after the view schema normalizes optionals. */
export type SocialPostSchemaData = JsonReady<EnrichedSocialPost>;

export const socialPostViewSchema: z.ZodType<SocialPostSchemaData> = z.object({
  id: z.string(),
  entityType: z.literal("social-post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  url: nullableString,
  listUrl: nullableString,
  listLabel: nullableString,
  typeLabel: nullableString,
  coverImageUrl: nullableString,
  coverImageWidth: nullableNumber,
  coverImageHeight: nullableNumber,
});

/** Render payload after site-builder adds deterministic entity URL fields. */
export type SocialPostView = Omit<
  SocialPostSchemaData,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};

/**
 * Runtime counterpart to {@link SocialPostView}: the same fields with the
 * link slots site-builder fills required, so the render path can prove the
 * enrichment ran instead of assuming it.
 */
export const socialPostRenderSchema: z.ZodType<SocialPostView> = z.object({
  id: z.string(),
  entityType: z.literal("social-post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  url: z.string(),
  listUrl: z.string(),
  listLabel: z.string(),
  typeLabel: z.string(),
  coverImageUrl: nullableString,
  coverImageWidth: nullableNumber,
  coverImageHeight: nullableNumber,
});
