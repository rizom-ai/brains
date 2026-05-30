import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { parseAtprotoLexicon } from "@brains/atproto";
import type {
  AtprotoBlobRef,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { blogPostFrontmatterSchema } from "./schemas/blog-post";
import postLexicon from "../lexicons/ai.rizom.brain.post.json";

export interface BlogAtprotoPostRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.post";
  title: string;
  summary?: string;
  body: string;
  format: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  canonicalUrl?: string;
  topics?: string[];
  coverImage?: BlogAtprotoCoverImage;
  series?: string;
  seriesIndex?: number;
  sourceEntityType: "post";
  sourceEntityId: string;
  createdAt: string;
  publishedAt?: string;
}

export interface BlogAtprotoCoverImage {
  blob: AtprotoBlobRef;
  alt?: string;
  width?: number;
  height?: number;
}

interface BlobUploader {
  uploadBlob?(input: {
    data: Buffer;
    mimeType: string;
  }): Promise<{ blob: AtprotoBlobRef }>;
}

function dataUrlToUploadInput(dataUrl: string): {
  data: Buffer;
  mimeType: string;
} {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new Error("Cover image must be a base64 data URL");
  }

  return {
    data: Buffer.from(match[2], "base64"),
    mimeType: match[1],
  };
}

async function uploadCoverImage(
  context: ServicePluginContext,
  entity: BaseEntity,
  client: BlobUploader | undefined,
): Promise<BlogAtprotoCoverImage | undefined> {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  const coverImageId = parsed.metadata.coverImageId;
  if (!coverImageId) return undefined;
  if (!client) return undefined;
  if (!client.uploadBlob) {
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

  const uploadInput = dataUrlToUploadInput(image.content);
  const uploaded = await client.uploadBlob(uploadInput);
  const metadata = image.metadata;
  const alt = typeof metadata["alt"] === "string" ? metadata["alt"] : undefined;
  const width =
    typeof metadata["width"] === "number" ? metadata["width"] : undefined;
  const height =
    typeof metadata["height"] === "number" ? metadata["height"] : undefined;

  return {
    blob: uploaded.blob,
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
}: AtprotoProjectionBuildInput): Promise<BlogAtprotoPostRecord> {
  if (entity.entityType !== "post") {
    throw new Error(`Expected entityType post, got ${entity.entityType}`);
  }

  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  const frontmatter = parsed.metadata;
  const coverImage = await uploadCoverImage(context, entity, client);

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

export function createBlogAtprotoProjection(): AtprotoProjection<BlogAtprotoPostRecord> {
  return {
    entityType: "post",
    collection: "ai.rizom.brain.post",
    lexicon: parseAtprotoLexicon(postLexicon),
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
