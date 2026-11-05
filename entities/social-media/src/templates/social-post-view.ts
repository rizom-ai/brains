import { entityViewFields, type EntityViewFields } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { renderedLinkFields, viewLinkFields } from "@brains/templates";
import {
  platformSchema,
  socialPostStatusSchema,
  sourceEntityTypeSchema,
  type EnrichedSocialPost,
} from "../schemas/social-post";

const nullableString: z.ZodDefault<z.ZodNullable<z.ZodString>> = z
  .string()
  .nullable()
  .default(null);
const nullableNumber: z.ZodDefault<z.ZodNullable<z.ZodNumber>> = z
  .number()
  .nullable()
  .default(null);

const documentAttachmentSchema: z.ZodObject<{ id: z.ZodString }> = z.object({
  id: z.string().min(1),
});
const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  platform: typeof platformSchema;
  status: typeof socialPostStatusSchema;
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
  status: socialPostStatusSchema,
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
  status: typeof socialPostStatusSchema;
  publishedAt: typeof nullableString;
  platformPostId: typeof nullableString;
  slug: z.ZodString;
  error: typeof nullableString;
}> = z.object({
  title: z.string(),
  platform: platformSchema,
  status: socialPostStatusSchema,
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

export const socialPostViewSchema: z.ZodObject<
  EntityViewFields<
    "social-post",
    typeof metadataSchema,
    typeof frontmatterSchema
  > & {
    body: z.ZodString;
    url: typeof viewLinkFields.url;
    listUrl: typeof viewLinkFields.listUrl;
    listLabel: typeof viewLinkFields.listLabel;
    typeLabel: typeof viewLinkFields.typeLabel;
    coverImageUrl: typeof nullableString;
    coverImageWidth: typeof nullableNumber;
    coverImageHeight: typeof nullableNumber;
  }
> = z.object({
  ...entityViewFields("social-post", metadataSchema, frontmatterSchema),
  body: z.string(),
  url: viewLinkFields.url,
  listUrl: viewLinkFields.listUrl,
  listLabel: viewLinkFields.listLabel,
  typeLabel: viewLinkFields.typeLabel,
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
export const socialPostRenderSchema: z.ZodType<SocialPostView> =
  socialPostViewSchema.extend(renderedLinkFields);
