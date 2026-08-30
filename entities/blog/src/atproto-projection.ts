import type { BaseEntity } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoBlobRef,
  AtprotoBrainPostRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
  AtprotoProjectionContext,
} from "@brains/atproto-contracts";
import { resolveImageBytes } from "@brains/image";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { blogPostFrontmatterSchema } from "./schemas/blog-post";

type BlogAtprotoCoverImage = NonNullable<AtprotoBrainPostRecord["coverImage"]>;

interface BlobUploader {
  uploadBlob?(input: {
    data: Buffer;
    mimeType: string;
  }): Promise<{ blob: AtprotoBlobRef }>;
}

async function uploadCoverImage(
  context: AtprotoProjectionContext,
  entity: BaseEntity,
  client: BlobUploader | undefined,
  dryRun: boolean,
): Promise<BlogAtprotoCoverImage | undefined> {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  const coverImageId = parsed.metadata.coverImageId;
  if (!coverImageId) return undefined;
  if (!client && !dryRun) return undefined;
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

  const resolved = await resolveImageBytes(image, context.entityService);
  const uploadInput = {
    data: Buffer.from(resolved.bytes),
    mimeType: resolved.mediaType,
  };
  const blob = dryRun
    ? {
        $type: "blob" as const,
        ref: { $link: "dry-run" },
        mimeType: uploadInput.mimeType,
        size: uploadInput.data.byteLength,
      }
    : (await client?.uploadBlob?.(uploadInput))?.blob;
  if (!blob) return undefined;
  const metadata = image.metadata;
  const alt = typeof metadata["alt"] === "string" ? metadata["alt"] : undefined;
  const width =
    typeof metadata["width"] === "number" ? metadata["width"] : undefined;
  const height =
    typeof metadata["height"] === "number" ? metadata["height"] : undefined;

  return {
    blob,
    ...(alt && { alt }),
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  };
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
  const coverImage = await uploadCoverImage(context, entity, client, dryRun);

  return {
    $type: "ai.rizom.brain.post",
    title: frontmatter.title,
    summary: frontmatter.excerpt,
    body: parsed.content,
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
