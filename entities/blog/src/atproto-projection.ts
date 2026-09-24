import type { BaseEntity } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  withPublishEntityFile,
} from "@brains/plugins";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoPdsClientLike,
  AtprotoBrainPostRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
  AtprotoProjectionContext,
} from "@brains/atproto-contracts";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import {
  prepareAtprotoBodyImages,
  AcknowledgedAtprotoPostImagesError,
  type AtprotoBodyImageReceipt,
} from "./atproto-body-images";
import { blogPostFrontmatterSchema } from "./schemas/blog-post";

type BlogAtprotoCoverImage = NonNullable<AtprotoBrainPostRecord["coverImage"]>;

export class AcknowledgedAtprotoCoverError extends Error {
  public readonly coverImage: BlogAtprotoCoverImage;
  constructor(coverImage: BlogAtprotoCoverImage, cause: unknown) {
    super("AT Protocol cover uploaded but source retirement failed", { cause });
    this.name = "AcknowledgedAtprotoCoverError";
    this.coverImage = coverImage;
  }
}

async function uploadCoverImage(
  context: AtprotoProjectionContext,
  entity: BaseEntity,
  client: AtprotoPdsClientLike | undefined,
  dryRun: boolean,
  bodyReceipts: readonly AtprotoBodyImageReceipt[],
): Promise<BlogAtprotoCoverImage | undefined> {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  const coverImageId = parsed.metadata.coverImageId;
  if (!coverImageId) return undefined;
  if (!client && !dryRun)
    throw new Error("AT Protocol cover upload requires a PDS client");
  if (client && !client.uploadBlob) {
    throw new Error("AT Protocol PDS client does not support blob uploads");
  }

  const image = await context.entityService.getEntity({
    entityType: "image",
    id: coverImageId,
  });
  if (!image) return undefined;
  if (image.visibility !== "public") {
    throw new Error(`Cannot publish non-public cover image: ${image.id}`);
  }

  let acknowledged: BlogAtprotoCoverImage | undefined;
  let loanSignal: AbortSignal | undefined;
  try {
    const result = await withPublishEntityFile(
      context.entityService,
      image,
      "image",
      async (file) => {
        loanSignal = file.signal;
        file.signal.throwIfAborted();
        const prior = bodyReceipts.find(
          (receipt) =>
            receipt.imageId === coverImageId &&
            receipt.sha256 === file.sha256 &&
            receipt.blob.size === file.sizeBytes &&
            receipt.blob.mimeType === file.mimeType,
        );
        const blob = dryRun
          ? {
              $type: "blob" as const,
              ref: { $link: "dry-run" },
              mimeType: file.mimeType,
              size: file.sizeBytes,
            }
          : (prior?.blob ?? (await client?.uploadBlob?.(file))?.blob);
        if (!blob)
          throw new Error("AT Protocol blob upload returned no receipt");
        const metadata = image.metadata;
        const alt =
          typeof metadata["alt"] === "string" ? metadata["alt"] : undefined;
        const width =
          typeof metadata["width"] === "number" ? metadata["width"] : undefined;
        const height =
          typeof metadata["height"] === "number"
            ? metadata["height"]
            : undefined;

        const cover = {
          blob,
          ...(alt && { alt }),
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
        };
        if (!dryRun) acknowledged = cover;
        return cover;
      },
    );
    loanSignal?.throwIfAborted();
    return result;
  } catch (error) {
    if (acknowledged)
      throw new AcknowledgedAtprotoCoverError(acknowledged, error);
    throw error;
  }
}

export async function buildBlogAtprotoPostRecord({
  entity,
  context,
  config,
  client,
  topics,
  dryRun = false,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainPostRecord> {
  if (entity.entityType !== "post") {
    throw new Error(`Expected entityType post, got ${entity.entityType}`);
  }

  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  const frontmatter = parsed.metadata;
  const prepared = await prepareAtprotoBodyImages(parsed.content, {
    context,
    ...(client && { client }),
    dryRun,
  });
  let coverImage: BlogAtprotoCoverImage | undefined;
  try {
    coverImage = await uploadCoverImage(
      context,
      entity,
      client,
      dryRun,
      prepared.receipts,
    );
  } catch (error) {
    if (prepared.receipts.length)
      throw new AcknowledgedAtprotoPostImagesError(prepared.receipts, error);
    throw error;
  }

  return {
    $type: "ai.rizom.brain.post",
    title: frontmatter.title,
    summary: frontmatter.excerpt,
    body: prepared.body,
    ...(prepared.images.length && { images: prepared.images }),
    format: "text/markdown",
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    ...(frontmatter.canonicalUrl && { canonicalUrl: frontmatter.canonicalUrl }),
    ...(topics && topics.length > 0 && { topics }),
    ...(coverImage && { coverImage }),
    ...(frontmatter.seriesName && { series: frontmatter.seriesName }),
    ...(frontmatter.seriesIndex !== undefined && {
      seriesIndex: frontmatter.seriesIndex,
    }),
    sourceEntityType: "post",
    sourceEntityId: entity.id,
    createdAt: entity.created,
    ...(frontmatter.publishedAt && { publishedAt: frontmatter.publishedAt }),
  };
}

export function createBlogAtprotoProjection(): AtprotoProjection<AtprotoBrainPostRecord> {
  return {
    entityType: "post",
    collection: "ai.rizom.brain.post",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.post"],
    validate: false,
    buildRecord: buildBlogAtprotoPostRecord,
    onPublished: async ({ entity, context, uri }): Promise<void> => {
      if (entity.entityType !== "post") {
        throw new Error(`Expected entityType post, got ${entity.entityType}`);
      }

      const parsed = parseMarkdownWithFrontmatter(
        entity.content,
        blogPostFrontmatterSchema,
      );
      const content = blogPostAdapter.createPostContent(
        {
          ...parsed.metadata,
          atprotoUri: uri,
        },
        parsed.content,
      );

      await context.entityService.updateEntity({
        entity: {
          ...entity,
          content,
        },
      });
    },
  };
}
