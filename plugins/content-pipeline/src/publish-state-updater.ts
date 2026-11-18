import { writeOnCurrent } from "@brains/utils/write-on-current";
import { internalFullScope } from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { PublishResult } from "@brains/contracts";
import { updateFrontmatterField } from "@brains/utils/markdown";
import { FRONTMATTER_BLOCK } from "@brains/utils/markdown-frontmatter";
import type { PipelineContext } from "./lib/pipeline-context";

export interface MarkPublishedOptions {
  publishedAt?: string;
  publishResultIdField?: string;
  publishTimestampField?: string;
}

/**
 * Centralizes durable publish state updates.
 *
 * Metadata is always updated. Markdown frontmatter is updated only when the
 * entity already has a frontmatter block, so plain-text publishable entities do
 * not gain YAML as a side effect.
 */
export async function markEntityPublished(
  context: Pick<PipelineContext, "entityService">,
  entity: BaseEntity,
  result: PublishResult,
  options: MarkPublishedOptions = {},
): Promise<BaseEntity> {
  const publishTimestampField = options.publishTimestampField ?? "publishedAt";
  const existingPublishedAt = entity.metadata[publishTimestampField];
  const publishedAt =
    options.publishedAt ??
    (typeof existingPublishedAt === "string"
      ? existingPublishedAt
      : undefined) ??
    new Date().toISOString();
  const asPublished = (current: BaseEntity): BaseEntity => ({
    ...current,
    content: updatePublishFrontmatter(
      current.content,
      publishedAt,
      result.id,
      options.publishResultIdField,
      publishTimestampField,
    ),
    metadata: {
      ...current.metadata,
      status: "published",
      [publishTimestampField]: publishedAt,
      platformId: result.id,
      ...getPublishResultMetadata(result.id, options.publishResultIdField),
    },
  });

  // The post is out already, so this result is never dropped: over a
  // version that changed while the provider published, the publish fields
  // are set on that version and its text stays.
  const written: { entity: BaseEntity } = {
    entity: asPublished(entity),
  };
  await writeOnCurrent({
    from: entity,
    read: () =>
      context.entityService.getEntity({
        entityType: entity.entityType,
        id: entity.id,
        visibilityScope: internalFullScope("record a completed publish"),
      }),
    change: (current) => {
      written.entity = asPublished(current);
      return written.entity;
    },
    write: (changed, expectedContentHash) =>
      context.entityService.updateEntity({
        entity: changed,
        options: { expectedContentHash },
      }),
  });
  return written.entity;
}

export function updatePublishFrontmatter(
  content: string,
  publishedAt: string,
  resultId?: string,
  publishResultIdField?: string,
  publishTimestampField = "publishedAt",
): string {
  if (!FRONTMATTER_BLOCK.test(content)) return content;
  const updated = updateFrontmatterField(
    updateFrontmatterField(content, "status", "published"),
    publishTimestampField,
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
