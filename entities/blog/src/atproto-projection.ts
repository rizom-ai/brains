import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type { AtprotoBrainPostRecord } from "@brains/atproto-contracts";
import { imageMetadataSchema } from "@brains/image";
import {
  defineEntity,
  type EntityAtprotoProjection,
  type EntityAtprotoRecordInput,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import type { blogPostMetadataSchema } from "./schemas/blog-post";
import { parseBase64DataUrl } from "@brains/utils/data-url";

type PostRecord = EntityOf<
  EntityDefinition<"post", typeof blogPostMetadataSchema>
>;

type BlogAtprotoCoverImage = NonNullable<AtprotoBrainPostRecord["coverImage"]>;

/**
 * The image a post's cover names, read for its bytes. The image type is
 * the images package's; a post reads it by this shape and never installs it.
 */
const imageShape = defineEntity({
  type: "image",
  purpose: "An image a post shows as its cover.",
  metadata: imageMetadataSchema,
});

/**
 * The post's cover, stored on the PDS: a public image the post names, with
 * its alt text and size. The record is built from public entries only, so
 * a cover that is not public is left out.
 */
async function uploadCoverImage({
  entity,
  entities,
  uploadBlob,
}: EntityAtprotoRecordInput<PostRecord>): Promise<
  BlogAtprotoCoverImage | undefined
> {
  const coverImageId = entity.metadata.coverImageId;
  if (!coverImageId) return undefined;
  const image = await entities.get(imageShape, coverImageId);
  if (!image) return undefined;
  const cover = parseBase64DataUrl(image.content);
  if (!cover) throw new Error("Cover image must be a base64 data URL");
  const blob = await uploadBlob(cover);
  const { alt, width, height } = image.metadata;
  return {
    blob,
    ...(alt && { alt }),
    width,
    height,
  };
}

/** A post as its ai.rizom.brain.post record: its fields and its body. */
export async function buildBlogAtprotoPostRecord(
  input: EntityAtprotoRecordInput<PostRecord>,
): Promise<AtprotoBrainPostRecord> {
  const { entity, config, topics, pageUrl } = input;
  const { metadata } = entity;
  const coverImage = await uploadCoverImage(input);
  // An essay first published elsewhere keeps that address; otherwise its page here.
  const canonicalUrl = metadata.canonicalUrl ?? pageUrl;
  return {
    $type: "ai.rizom.brain.post",
    title: metadata.title,
    summary: metadata.excerpt,
    body: entity.content,
    format: "text/markdown",
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    ...(canonicalUrl && { canonicalUrl }),
    ...(topics && topics.length > 0 && { topics: [...topics] }),
    ...(coverImage && { coverImage }),
    ...(metadata.seriesName && { series: metadata.seriesName }),
    ...(metadata.seriesIndex !== undefined && {
      seriesIndex: metadata.seriesIndex,
    }),
    sourceEntityType: "post",
    sourceEntityId: entity.id,
    createdAt: entity.created,
    ...(metadata.publishedAt && { publishedAt: metadata.publishedAt }),
  };
}

/**
 * Post records go out unvalidated, under the canonical post lexicon, once
 * the post is published.
 */
export const postAtproto: EntityAtprotoProjection<PostRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.post"],
  validate: false,
  isPublishable: (entity) => entity.metadata.status === "published",
  buildRecord: buildBlogAtprotoPostRecord,
};
