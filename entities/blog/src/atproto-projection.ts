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
import { compareBySeriesPosition, getSeriesName } from "@brains/contracts";
import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import type { blogPostMetadataSchema } from "./schemas/blog-post";
import { atprotoProvenance } from "@brains/atproto-contracts";

type PostDefinition = EntityDefinition<"post", typeof blogPostMetadataSchema>;
type PostRecord = EntityOf<PostDefinition>;

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

/** The media type a stored image is uploaded as. */
function coverMediaType(metadata: {
  readonly mediaType?: string | undefined;
  readonly format?: string | undefined;
}): string {
  if (metadata.mediaType) return metadata.mediaType;
  const format = metadata.format ?? "png";
  return `image/${format === "jpg" ? "jpeg" : format}`;
}

/**
 * The post's cover, stored on the PDS: a public image the post names, with
 * its alt text and size. The record is built from public entries only, so
 * a cover that is not public is left out.
 */
async function uploadCoverImage(
  input: EntityAtprotoRecordInput<PostRecord>,
): Promise<BlogAtprotoCoverImage | undefined> {
  const { entity, uploadBlob } = input;
  const coverImageId = entity.metadata.coverImageId;
  if (!coverImageId) return undefined;
  // Read as stored at the public scope, and its bytes through that record:
  // never a bare reference another image shares.
  const assets = entityRuntime(input).assets;
  const image = await assets.getStored(imageShape, coverImageId);
  if (!image) return undefined;
  const data = await assets.read(imageShape, coverImageId);
  if (!data) return undefined;
  const blob = await uploadBlob({
    data,
    mimeType: coverMediaType(image.metadata),
  });
  const { alt, width, height } = image.metadata;
  return {
    blob,
    ...(alt && { alt }),
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  };
}

/**
 * The post's place in its series, as its series page numbers it: among the
 * public posts in the series, by when they were published.
 */
async function seriesPlace(
  input: EntityAtprotoRecordInput<PostRecord>,
  definition: PostDefinition,
  seriesName: string,
): Promise<number | undefined> {
  // Public posts only: the record reads at the PDS's scope.
  const posts = await input.entities.list(definition, { limit: 1000 });
  const place =
    posts
      .filter((post) => getSeriesName(post) === seriesName)
      .sort(compareBySeriesPosition)
      .findIndex((post) => post.id === input.entity.id) + 1;
  return place === 0 ? undefined : place;
}

/** A post as its ai.rizom.brain.post record: its fields and its body. */
export async function buildBlogAtprotoPostRecord(
  input: EntityAtprotoRecordInput<PostRecord>,
  definition: PostDefinition,
): Promise<AtprotoBrainPostRecord> {
  const { entity, config, topics, pageUrl } = input;
  const { metadata } = entity;
  const coverImage = await uploadCoverImage(input);
  const seriesName = getSeriesName(entity);
  const seriesIndex = seriesName
    ? await seriesPlace(input, definition, seriesName)
    : undefined;
  // An essay first published elsewhere keeps that address; otherwise its page here.
  const canonicalUrl = metadata.canonicalUrl ?? pageUrl;
  return {
    $type: "ai.rizom.brain.post",
    title: metadata.title,
    summary: metadata.excerpt,
    body: entity.content,
    format: "text/markdown",
    ...(topics && topics.length > 0 && { topics: [...topics] }),
    ...(coverImage && { coverImage }),
    ...(seriesName && { series: seriesName }),
    ...(seriesIndex !== undefined && { seriesIndex }),
    ...atprotoProvenance({ config, pageUrl: canonicalUrl }, entity),
    ...(pageUrl && { pageUrl }),
    sourceEntityType: "post",
    ...(metadata.publishedAt && { publishedAt: metadata.publishedAt }),
  };
}

/**
 * Post records go out unvalidated, under the canonical post lexicon, once
 * the post is published.
 */
export function postAtproto(
  definition: () => PostDefinition,
): EntityAtprotoProjection<PostRecord> {
  return {
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.post"],
    validate: false,
    isPublishable: (entity) => entity.metadata.status === "published",
    // The post definition is read when a record is built, not while the
    // definition that names this projection is still being made.
    buildRecord: (input) => buildBlogAtprotoPostRecord(input, definition()),
  };
}
