import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { PublishResult } from "@brains/contracts";
import { updateFrontmatterField } from "@brains/utils";

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export interface MarkPublishedOptions {
  publishedAt?: string;
  publishResultIdField?: string;
}

/**
 * Centralizes durable publish state updates.
 *
 * Metadata is always updated. Markdown frontmatter is updated only when the
 * entity already has a frontmatter block, so plain-text publishable entities do
 * not gain YAML as a side effect.
 */
export async function markEntityPublished<
  TMetadata extends Record<string, unknown>,
>(
  context: Pick<ServicePluginContext, "entityService">,
  entity: BaseEntity<TMetadata>,
  result: PublishResult,
  options: MarkPublishedOptions = {},
): Promise<BaseEntity<TMetadata & Record<string, unknown>>> {
  const publishedAt = options.publishedAt ?? new Date().toISOString();
  const metadata = {
    ...entity.metadata,
    status: "published",
    publishedAt,
    platformId: result.id,
    ...getPublishResultMetadata(result.id, options.publishResultIdField),
  };

  const updated = {
    ...entity,
    content: updatePublishFrontmatter(
      entity.content,
      publishedAt,
      result.id,
      options.publishResultIdField,
    ),
    metadata,
  };

  await context.entityService.updateEntity({ entity: updated });
  return updated;
}

export function updatePublishFrontmatter(
  content: string,
  publishedAt: string,
  resultId?: string,
  publishResultIdField?: string,
): string {
  if (!FRONTMATTER_BLOCK.test(content)) return content;
  const updated = updateFrontmatterField(
    updateFrontmatterField(content, "status", "published"),
    "publishedAt",
    publishedAt,
  );

  if (!resultId || !publishResultIdField) return updated;
  return updateFrontmatterField(updated, publishResultIdField, resultId);
}

function getPublishResultMetadata(
  resultId: string,
  publishResultIdField: string | undefined,
): Record<string, string> {
  if (!publishResultIdField || publishResultIdField === "platformId") {
    return {};
  }
  return { [publishResultIdField]: resultId };
}
