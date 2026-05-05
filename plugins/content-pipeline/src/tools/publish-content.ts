import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { PublishImageData } from "@brains/utils";
import type { PublishableMetadata } from "../schemas/publishable";

type PublishableEntity = BaseEntity<PublishableMetadata>;

interface ParsedPublishContent {
  bodyContent: string;
  coverImageId?: string;
}

export interface PreparedPublishContent {
  bodyContent: string;
  imageData?: PublishImageData;
}

export async function preparePublishContent(
  context: ServicePluginContext,
  entity: PublishableEntity,
): Promise<PreparedPublishContent> {
  const { bodyContent, coverImageId } = parsePublishContent(entity.content);
  const imageData = coverImageId
    ? await fetchPublishImageData(context, coverImageId)
    : undefined;

  const prepared: PreparedPublishContent = { bodyContent };
  if (imageData) {
    prepared.imageData = imageData;
  }
  return prepared;
}

function parsePublishContent(content: string): ParsedPublishContent {
  try {
    const parsed = parseMarkdownWithFrontmatter(content, z.record(z.unknown()));
    const rawCoverImageId = parsed.metadata["coverImageId"];
    const coverImageId =
      typeof rawCoverImageId === "string" ? rawCoverImageId : undefined;

    return coverImageId
      ? { bodyContent: parsed.content, coverImageId }
      : { bodyContent: parsed.content };
  } catch {
    return { bodyContent: content };
  }
}

async function fetchPublishImageData(
  context: ServicePluginContext,
  coverImageId: string,
): Promise<PublishImageData | undefined> {
  const image = await context.entityService.getEntity<BaseEntity>({
    entityType: "image",
    id: coverImageId,
  });
  if (!image?.content) return undefined;

  const match = image.content.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return undefined;

  return {
    data: Buffer.from(match[2], "base64"),
    mimeType: match[1],
  };
}
