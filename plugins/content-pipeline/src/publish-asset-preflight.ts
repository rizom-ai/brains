import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { parseMarkdown, slugify } from "@brains/utils";
import type {
  PublishAssetDefinition,
  PublishAssetTargetField,
  PublishAssetRegistry,
} from "./publish-assets";

export interface PublishAssetPreflightResult {
  checked: number;
  enqueued: number;
  skipped: number;
}

export interface PublishAssetPreflightDeps {
  context: Pick<ServicePluginContext, "attachments" | "jobs" | "logger">;
  registry: PublishAssetRegistry;
}

/**
 * Ensures configured publish-adjacent assets exist for a published entity.
 *
 * V1 intentionally queues missing assets asynchronously and never regenerates
 * existing target fields. Stale detection is deferred to avoid self-referential
 * hashes when generated assets update the source entity frontmatter.
 */
export class PublishAssetPreflight {
  private readonly deps: PublishAssetPreflightDeps;
  constructor(deps: PublishAssetPreflightDeps) {
    this.deps = deps;
  }

  public async ensureForEntity(
    entity: BaseEntity,
    options: { attachmentType?: string } = {},
  ): Promise<PublishAssetPreflightResult> {
    const definitions = this.deps.registry
      .list(entity.entityType)
      .filter((definition) => definition.autoGenerate === true)
      .filter(
        (definition) =>
          !options.attachmentType ||
          definition.attachmentType === options.attachmentType,
      );
    const result: PublishAssetPreflightResult = {
      checked: definitions.length,
      enqueued: 0,
      skipped: 0,
    };

    for (const definition of definitions) {
      const enqueued = await this.ensureDefinition(entity, definition);
      if (enqueued) {
        result.enqueued += 1;
      } else {
        result.skipped += 1;
      }
    }

    return result;
  }

  private async ensureDefinition(
    entity: BaseEntity,
    definition: PublishAssetDefinition,
  ): Promise<boolean> {
    if (!this.matchesPolicy(entity, definition)) return false;
    if (this.hasTargetField(entity, definition.targetEntityField)) return false;
    if (
      !this.deps.context.attachments.hasProvider(
        entity.entityType,
        definition.attachmentType,
      )
    ) {
      return false;
    }

    const jobType = this.resolveJobType(definition);
    if (!jobType) return false;

    const mediaId = this.getPredictedMediaId(entity, definition);
    const deduplicationKey = this.getDeduplicationKey(entity, definition);
    await this.deps.context.jobs.enqueue({
      type: jobType,
      data: {
        sourceEntityType: entity.entityType,
        sourceEntityId: entity.id,
        attachmentType: definition.attachmentType,
        imageId: mediaId,
        dedupKey: deduplicationKey,
        targetEntityType: entity.entityType,
        targetEntityId: entity.id,
        ...this.getTargetImageFieldData(definition.targetEntityField),
      },
      options: {
        source: "content-pipeline",
        metadata: {
          operationType: "content_operations",
        },
        deduplication: "skip",
        deduplicationKey,
      },
    });
    this.deps.context.logger.debug("Queued publish asset generation", {
      entityType: entity.entityType,
      entityId: entity.id,
      attachmentType: definition.attachmentType,
      jobType,
    });
    return true;
  }

  private matchesPolicy(
    entity: BaseEntity,
    definition: PublishAssetDefinition,
  ): boolean {
    const { requiredWhen } = definition;
    if (!requiredWhen) return true;

    if (
      requiredWhen.status &&
      entity.metadata["status"] !== requiredWhen.status
    ) {
      return false;
    }

    if (
      requiredWhen.visibility &&
      entity.visibility !== requiredWhen.visibility
    ) {
      return false;
    }

    return true;
  }

  private hasTargetField(
    entity: BaseEntity,
    targetField: PublishAssetTargetField | undefined,
  ): boolean {
    if (!targetField) return false;

    if (typeof targetField === "string") {
      return hasValue(entity.metadata[targetField]);
    }

    if (targetField.location === "metadata") {
      return hasValue(entity.metadata[targetField.field]);
    }

    const { frontmatter } = parseMarkdown(entity.content);
    return hasValue(frontmatter[targetField.field]);
  }

  private resolveJobType(
    definition: PublishAssetDefinition,
  ): string | undefined {
    if (definition.jobType) return definition.jobType;
    if (definition.mediaEntityType === "image")
      return "image:image-render-source";
    return undefined;
  }

  private getPredictedMediaId(
    entity: BaseEntity,
    definition: PublishAssetDefinition,
  ): string {
    const prefix =
      definition.attachmentType === "og-image"
        ? "og"
        : definition.attachmentType;
    return slugify(`${prefix}-${entity.entityType}-${entity.id}`);
  }

  private getDeduplicationKey(
    entity: BaseEntity,
    definition: PublishAssetDefinition,
  ): string {
    return `publish-asset:${definition.attachmentType}:${entity.entityType}:${entity.id}`;
  }

  private getTargetImageFieldData(
    targetField: PublishAssetTargetField | undefined,
  ): { targetImageField?: "coverImageId" | "ogImageId" } {
    const field =
      typeof targetField === "string" ? targetField : targetField?.field;
    if (field === "coverImageId" || field === "ogImageId") {
      return { targetImageField: field };
    }
    return {};
  }
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.length > 0 : value !== undefined;
}
