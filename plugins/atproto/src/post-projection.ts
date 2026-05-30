import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import type { UploadBlobResult } from "./pds-client";
import {
  buildPostRecord,
  type BrainPostCoverImage,
  type BrainPostRecord,
} from "./post-record";
import type { AtprotoProjection } from "./projection-registry";

const postCoverImageFrontmatterSchema = z
  .object({
    coverImageId: z.string().optional(),
  })
  .passthrough();

interface BlobUploader {
  uploadBlob?(input: {
    data: Buffer;
    mimeType: string;
  }): Promise<UploadBlobResult>;
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

async function uploadPostCoverImage(
  context: ServicePluginContext,
  entity: BaseEntity,
  client: BlobUploader | undefined,
): Promise<BrainPostCoverImage | undefined> {
  const frontmatter = parseMarkdownWithFrontmatter(
    entity.content,
    postCoverImageFrontmatterSchema,
  ).metadata;
  if (!frontmatter.coverImageId) return undefined;
  if (!client) return undefined;
  if (!client.uploadBlob) {
    throw new Error("AT Protocol PDS client does not support blob uploads");
  }

  const image = await context.entityService.getEntity({
    entityType: "image",
    id: frontmatter.coverImageId,
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

export function createPostProjection(): AtprotoProjection {
  return {
    entityType: "post",
    collection: "ai.rizom.brain.post",
    validate: false,
    buildRecord: async ({
      entity,
      context,
      config,
      client,
      topics,
    }): Promise<BrainPostRecord> => {
      const coverImage = await uploadPostCoverImage(context, entity, client);
      return buildPostRecord(entity, {
        ...(config.brainDid && { brainDid: config.brainDid }),
        ...(config.anchorDid && { anchorDid: config.anchorDid }),
        ...(topics && { topics }),
        ...(coverImage && { coverImage }),
      });
    },
  };
}
