import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { PublishResult } from "@brains/contracts";
import type { ProviderRegistry } from "./provider-registry";
import type { PublishableMetadata } from "./schemas/publishable";
import { preparePublishContent } from "./tools/publish-content";
import { markEntityPublished } from "./publish-state-updater";

type PublishableEntity = BaseEntity<PublishableMetadata>;

export interface PublishEntityInput {
  entityType: string;
  id?: string | undefined;
  slug?: string | undefined;
}

export interface PublishEntitySuccess {
  entity: PublishableEntity;
  result: PublishResult;
}

export interface PublishEntityError {
  error: string;
}

export type PublishEntityResult = PublishEntitySuccess | PublishEntityError;

export interface PublishEntityExecutor {
  publish(input: PublishEntityInput): Promise<PublishEntityResult>;
}

export interface PublishExecutorDeps {
  context: ServicePluginContext;
  providerRegistry: ProviderRegistry;
  publishAssetPreflight?:
    | {
        ensureForEntity(entity: BaseEntity): Promise<unknown>;
      }
    | undefined;
  requireProviderExecutionMode?: boolean;
}

/**
 * Executes direct provider publishing for a publishable entity.
 *
 * This is the first consolidation seam: direct tools can use the same publish
 * validation/content preparation/state update flow, and queued provider-mode
 * execution can be moved here without changing tool behavior.
 */
export class PublishExecutor implements PublishEntityExecutor {
  constructor(private readonly deps: PublishExecutorDeps) {}

  public async publish(
    input: PublishEntityInput,
  ): Promise<PublishEntityResult> {
    const { entityType, id, slug } = input;

    if (!id && !slug) {
      return { error: "Either 'id' or 'slug' must be provided" };
    }

    const entity = await this.findPublishableEntity(entityType, id, slug);
    if (!entity) {
      const identifier = id ?? slug;
      return { error: `Entity not found: ${entityType}:${identifier}` };
    }

    if (entity.visibility !== "public") {
      return {
        error: `Cannot publish ${entityType}:${entity.id} to a public provider because visibility is ${entity.visibility}`,
      };
    }

    if (entity.metadata.status === "published") {
      return { error: "Entity is already published" };
    }

    if (!this.deps.providerRegistry.has(entityType)) {
      return {
        error: `No publish provider registered for ${entityType}. Check that the required credentials are configured.`,
      };
    }

    if (
      this.deps.requireProviderExecutionMode === true &&
      this.deps.providerRegistry.getExecutionMode(entityType) !== "provider"
    ) {
      return {
        error: `Entity type ${entityType} is not registered for direct provider execution`,
      };
    }

    const provider = this.deps.providerRegistry.get(entityType);
    const { bodyContent, imageData, documentData } =
      await preparePublishContent(this.deps.context, entity);

    const result = await provider.publish(
      bodyContent,
      entity.metadata,
      imageData,
      documentData,
    );
    const updated = await markEntityPublished(
      this.deps.context,
      entity,
      result,
    );
    await this.runPublishAssetPreflight(updated);

    return { entity: updated as PublishableEntity, result };
  }

  private async runPublishAssetPreflight(entity: BaseEntity): Promise<void> {
    if (!this.deps.publishAssetPreflight) return;
    try {
      await this.deps.publishAssetPreflight.ensureForEntity(entity);
    } catch (error) {
      this.deps.context.logger.warn("Publish asset preflight failed", {
        entityType: entity.entityType,
        entityId: entity.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async findPublishableEntity(
    entityType: string,
    id?: string,
    slug?: string,
  ): Promise<PublishableEntity | null> {
    if (id) {
      return this.deps.context.entityService.getEntity<PublishableEntity>({
        entityType,
        id,
      });
    }

    if (!slug) return null;

    const entities =
      await this.deps.context.entityService.listEntities<PublishableEntity>({
        entityType,
        options: {
          filter: { metadata: { slug } },
          limit: 1,
        },
      });
    return entities[0] ?? null;
  }
}
