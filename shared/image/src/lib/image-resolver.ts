import { updateFrontmatterField } from "@brains/utils/markdown";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";

// Matches the leading `---\n…\n---` frontmatter block. Capture group 1 is
// the inner YAML, so callers can parse just that slice and skip the body.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Extract coverImageId from entity content frontmatter
 *
 * This works for any entity type that stores coverImageId in YAML frontmatter.
 * No adapter-specific implementation needed.
 *
 * @param entity - The entity to extract coverImageId from
 * @returns The coverImageId string, or undefined if not found
 */
function extractFrontmatterStringField(
  entity: { content: string },
  field: string,
): string | undefined {
  const match = FRONTMATTER_BLOCK.exec(entity.content);
  if (!match?.[1]) return undefined;
  try {
    const parsed = frontmatterRecordSchema.safeParse(
      fromYaml<unknown>(match[1]),
    );
    if (parsed.success) {
      const value = parsed.data[field];
      return typeof value === "string" ? value : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function extractCoverImageId(entity: {
  content: string;
}): string | undefined {
  return extractFrontmatterStringField(entity, "coverImageId");
}

export function extractOgImageId(entity: {
  content: string;
}): string | undefined {
  return extractFrontmatterStringField(entity, "ogImageId");
}

export function setCoverImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  return {
    ...entity,
    content: updateFrontmatterField(entity.content, "coverImageId", imageId),
  };
}

export function setOgImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  return {
    ...entity,
    content: updateFrontmatterField(entity.content, "ogImageId", imageId),
  };
}
