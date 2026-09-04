import { z } from "@brains/utils/zod";
import type { EnrichedSocialPost } from "../schemas/social-post";

const platformSchema: z.ZodEnum<{ linkedin: "linkedin" }> = z.enum([
  "linkedin",
]);
const statusSchema: z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}> = z.enum(["generating", "draft", "queued", "published", "failed"]);
const sourceEntityTypeSchema: z.ZodEnum<{ post: "post"; deck: "deck" }> =
  z.enum(["post", "deck"]);
const nullableString: z.ZodDefault<z.ZodNullable<z.ZodString>> = z
  .string()
  .nullable()
  .default(null);
const nullableNumber: z.ZodDefault<z.ZodNullable<z.ZodNumber>> = z
  .number()
  .nullable()
  .default(null);

type Visibility = "public" | "shared" | "restricted";
const visibilitySchema: z.ZodPipe<
  z.ZodOptional<
    z.ZodUnion<
      readonly [
        z.ZodEnum<{
          public: "public";
          shared: "shared";
          restricted: "restricted";
        }>,
        z.ZodLiteral<"private">,
      ]
    >
  >,
  z.ZodTransform<Visibility, Visibility | "private" | undefined>
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const documentAttachmentSchema: z.ZodObject<{ id: z.ZodString }> = z.object({
  id: z.string().min(1),
});
const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  platform: typeof platformSchema;
  status: typeof statusSchema;
  coverImageId: typeof nullableString;
  documents: z.ZodDefault<
    z.ZodNullable<z.ZodArray<typeof documentAttachmentSchema>>
  >;
  publishedAt: typeof nullableString;
  platformPostId: typeof nullableString;
  sourceEntityId: typeof nullableString;
  sourceEntityType: z.ZodDefault<z.ZodNullable<typeof sourceEntityTypeSchema>>;
}> = z.object({
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
const metadataSchema: z.ZodObject<{
  title: z.ZodString;
  platform: typeof platformSchema;
  status: typeof statusSchema;
  publishedAt: typeof nullableString;
  platformPostId: typeof nullableString;
  slug: z.ZodString;
  error: typeof nullableString;
}> = z.object({
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

export const socialPostViewSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"social-post">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof visibilitySchema;
  metadata: typeof metadataSchema;
  contentHash: z.ZodString;
  frontmatter: typeof frontmatterSchema;
  body: z.ZodString;
  url: typeof nullableString;
  listUrl: typeof nullableString;
  listLabel: typeof nullableString;
  typeLabel: typeof nullableString;
  coverImageUrl: typeof nullableString;
  coverImageWidth: typeof nullableNumber;
  coverImageHeight: typeof nullableNumber;
}> = z.object({
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

// The view parses to exactly the JSON-ready enriched post, in both directions:
// nothing the schema yields is outside the payload type, and nothing the
// payload type carries is missing from the schema.
function expectSocialPostSchemaData(
  value: z.output<typeof socialPostViewSchema>,
): SocialPostSchemaData {
  return value;
}
function expectSocialPostViewOutput(
  value: SocialPostSchemaData,
): z.output<typeof socialPostViewSchema> {
  return value;
}
void expectSocialPostSchemaData;
void expectSocialPostViewOutput;

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
