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

export type PublishCandidateResolution =
  | { entity: PublishableEntity }
  | { error: string };

export interface PublishEntityExecutor {
  publish(input: PublishEntityInput): Promise<PublishEntityResult>;
  /**
   * Resolve and validate a publish candidate without publishing.
   * Shared with the publish tool so confirmation and execution apply the same
   * checks from a single source of truth.
   */
  resolveCandidate(
    input: PublishEntityInput,
  ): Promise<PublishCandidateResolution>;
}

export interface PublishExecutorDeps {
  context: ServicePluginContext;
  providerRegistry: ProviderRegistry;
  publishAssetPreflight?:
    | {
        ensureForEntity(entity: BaseEntity): Promise<unknown>;
      }
    | undefined;
}

/**
 * Executes direct provider publishing for a publishable entity.
 *
 * This is the first consolidation seam: direct tools can use the same publish
 * validation/content preparation/state update flow, and queued provider-mode
 * execution can be moved here without changing tool behavior.
 */
export class PublishExecutor implements PublishEntityExecutor {
  private readonly deps: PublishExecutorDeps;
  constructor(deps: PublishExecutorDeps) {
    this.deps = deps;
  }

  public async resolveCandidate(
    input: PublishEntityInput,
  ): Promise<PublishCandidateResolution> {
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

    return { entity };
  }

  public async publish(
    input: PublishEntityInput,
  ): Promise<PublishEntityResult> {
    const resolution = await this.resolveCandidate(input);
    if ("error" in resolution) return resolution;

    const { entity } = resolution;
    const { entityType } = input;
    const provider = this.deps.providerRegistry.get(entityType);
    const { bodyContent, imageData, documentData } =
      await preparePublishContent(this.deps.context, entity);

    const result = await provider.publish(
      bodyContent,
      entity.metadata,
      imageData,
      documentData,
    );
    const publishResultIdField =
      this.deps.providerRegistry.getPublishResultIdField(entityType);
    const publishTimestampField =
      this.deps.providerRegistry.getPublishTimestampField(entityType);
    const updated = await markEntityPublished(
      this.deps.context,
      entity,
      result,
      {
        ...(publishResultIdField ? { publishResultIdField } : {}),
        ...(publishTimestampField ? { publishTimestampField } : {}),
      },
    );
    // The markEntityPublished update above also emits entity:updated, which the
    // plugin routes to the same preflight for status changes that bypass this
    // executor (e.g. direct system_update). Running it here too is deliberate:
    // it guarantees preflight for executor-driven publishes regardless of event
    // delivery, and the overlap is collapsed by the job dedupe key.
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
