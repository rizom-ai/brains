import type { BaseEntity } from "@brains/entity-service";
import type { JsonObject } from "@brains/contracts";

/**
 * What a package delegated when it declared `publish`.
 *
 * The declaration says "something else decides when this goes out and calls
 * this provider". Recording the outcome is part of that act, so the runtime
 * keeps the write here, bound to the declaring package's own access, and
 * hands it to the service that does the publishing.
 */
export interface PublishDelegation {
  readonly entityType: string;
  /** Record the outcome, through the declaring package's own access. */
  update(entity: BaseEntity): Promise<{ entityId: string; jobId: string }>;
}

/**
 * Delegations in force, so a service that publishes on other packages'
 * behalf can be given exactly what they delegated and nothing else.
 *
 * A singleton for the same reason the projection and feed registries are:
 * declarations register as their plugins install, and the service that
 * consumes them installs separately and cannot be passed them.
 */
export class PublishDelegationRegistry {
  private static instance: PublishDelegationRegistry | undefined;
  private readonly delegations = new Map<string, PublishDelegation>();
  /** entityType → attachmentType → the generation job the declaration named. */
  private readonly assetJobTypes = new Map<string, Map<string, string>>();

  static getInstance(): PublishDelegationRegistry {
    this.instance ??= new PublishDelegationRegistry();
    return this.instance;
  }

  static createFresh(): PublishDelegationRegistry {
    return new PublishDelegationRegistry();
  }

  static resetInstance(): void {
    this.instance = undefined;
  }

  /** Returns a release handle, so the runtime owns teardown. */
  register(delegation: PublishDelegation): () => void {
    this.delegations.set(delegation.entityType, delegation);
    return (): void => {
      if (this.delegations.get(delegation.entityType) === delegation) {
        this.delegations.delete(delegation.entityType);
      }
    };
  }

  /**
   * The generation jobs one type's `publishAssets` named.
   *
   * Separate from the publish delegation because the two are separate
   * declarations: a type can need an asset generated without delegating
   * publishing, and the job belongs to a third package either way.
   */
  registerAssets(
    entityType: string,
    jobTypesByAttachment: ReadonlyMap<string, string>,
  ): () => void {
    const existing = this.assetJobTypes.get(entityType) ?? new Map();
    for (const [attachmentType, jobType] of jobTypesByAttachment) {
      existing.set(attachmentType, jobType);
    }
    this.assetJobTypes.set(entityType, existing);
    return (): void => {
      const current = this.assetJobTypes.get(entityType);
      if (!current) return;
      for (const [attachmentType, jobType] of jobTypesByAttachment) {
        if (current.get(attachmentType) === jobType) {
          current.delete(attachmentType);
        }
      }
      if (current.size === 0) this.assetJobTypes.delete(entityType);
    };
  }

  get(entityType: string): PublishDelegation | undefined {
    return this.delegations.get(entityType);
  }

  assetJobType(entityType: string, attachmentType: string): string | undefined {
    return this.assetJobTypes.get(entityType)?.get(attachmentType);
  }
}

/**
 * Publish state on entities other packages declared publishable.
 *
 * A service that publishes owns no entity types of its own, and this is not
 * a way to acquire any: every write goes through the declaration that asked
 * for it, and a type nobody delegated is refused.
 * Named consumer: @brains/content-pipeline.
 */
export interface ServicePublishingAccess {
  /** Whether this type's package delegated publishing. */
  delegated(entityType: string): boolean;
  /** Record the outcome of a publish on a delegated entity. */
  update(entity: BaseEntity): Promise<{ entityId: string; jobId: string }>;
  /**
   * The generation job this type's declaration named for that asset, or
   * undefined when it declared none. A caller checks before queueing rather
   * than reading a refusal as "nothing to generate".
   */
  assetJob(entityType: string, attachmentType: string): string | undefined;
  /**
   * Queue the generation job a `publishAssets` declaration named. The
   * declaration chooses the job; the caller says which entity and supplies
   * the payload that job's handler expects.
   */
  enqueueAsset(input: {
    readonly entityType: string;
    readonly attachmentType: string;
    readonly data: JsonObject;
    readonly deduplicationKey: string;
  }): Promise<string>;
}

export function createServicePublishingAccess(input: {
  readonly registry: PublishDelegationRegistry;
  readonly serviceLabel: string;
  enqueue(request: {
    type: string;
    data: JsonObject;
    deduplicationKey: string;
  }): Promise<string>;
}): ServicePublishingAccess {
  const { registry, serviceLabel, enqueue } = input;
  return {
    delegated: (entityType) => registry.get(entityType) !== undefined,
    assetJob: (entityType, attachmentType) =>
      registry.assetJobType(entityType, attachmentType),
    update: async (entity): Promise<{ entityId: string; jobId: string }> => {
      const delegation = registry.get(entity.entityType);
      if (!delegation) {
        throw new Error(
          `"${entity.entityType}" did not delegate publishing, so "${serviceLabel}" may not record a publish outcome on it`,
        );
      }
      return delegation.update(entity);
    },
    enqueueAsset: async ({
      entityType,
      attachmentType,
      data,
      deduplicationKey,
    }): Promise<string> => {
      const jobType = registry.assetJobType(entityType, attachmentType);
      if (!jobType) {
        throw new Error(
          `"${entityType}" did not declare "${attachmentType}" as a generated publish asset`,
        );
      }
      return enqueue({ type: jobType, data, deduplicationKey });
    },
  };
}
