import {
  internalFullScope,
  type BaseEntity,
  type BinaryContentMode,
  type ContentVisibility,
  type CreateEntityOptions,
  type EntityInput,
  type EntityMutationResult,
  type StagedAsset,
  type UpdateEntityOptions,
} from "@brains/entity-service";

export type PendingIngestionStatus = "pending" | "draft" | "failed";

export interface PendingEntityMetadata {
  status: PendingIngestionStatus | string;
  processingJobId?: string;
  processingError?: string;
}

export interface PendingEntityService {
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility;
    binaryContent?: BinaryContentMode;
  }): Promise<BaseEntity | null>;
  createEntity(request: {
    entity: EntityInput<BaseEntity>;
    stagedAsset?: StagedAsset | undefined;
    options?: CreateEntityOptions | undefined;
  }): Promise<EntityMutationResult>;
  updateEntity(request: {
    entity: BaseEntity;
    stagedAsset?: StagedAsset | undefined;
    options?: UpdateEntityOptions | undefined;
  }): Promise<EntityMutationResult>;
}

type EntityInputWithId = EntityInput<BaseEntity> & {
  id: string;
  entityType: string;
  content: string;
};

export interface CreatePendingEntityRequest {
  entityService: PendingEntityService;
  entity: EntityInputWithId;
  options?: CreateEntityOptions | undefined;
}

export interface CreatePendingEntityResult {
  entityId: string;
  created: boolean;
  existingEntity?: BaseEntity;
  mutation?: EntityMutationResult;
}

/**
 * Create a durable pending entity if one does not already exist.
 *
 * Use this before enqueueing async enrichment jobs so follow-up turns can find
 * the accepted item immediately. If the entity already exists, this function is
 * idempotent and returns the existing entity, with its stored content, without
 * modifying it.
 */
export async function createPendingEntity({
  entityService,
  entity,
  options,
}: CreatePendingEntityRequest): Promise<CreatePendingEntityResult> {
  const existingEntity = await entityService.getEntity({
    entityType: entity.entityType,
    id: entity.id,
    visibilityScope: internalFullScope("pending entity identity check"),
    // Only identity and visibility are read; stored bytes stay unloaded.
    binaryContent: "reference",
  });

  if (existingEntity) {
    return {
      entityId: existingEntity.id,
      created: false,
      existingEntity,
    };
  }

  const mutation = await entityService.createEntity({
    entity,
    ...(options ? { options } : {}),
  });
  return {
    entityId: mutation.entityId,
    created: true,
    mutation,
  };
}

export interface SaveProcessedEntityRequest {
  entityService: PendingEntityService;
  entity: EntityInputWithId;
  expectedContentHash?: string | undefined;
  /** Staged bytes published together with the processed entity. */
  stagedAsset?: StagedAsset | undefined;
}

export interface SaveProcessedEntityResult {
  entityId: string;
  updated: boolean;
  mutation: EntityMutationResult;
  previousEntity?: BaseEntity;
}

export interface FailPendingEntityRequest {
  entityService: Pick<PendingEntityService, "getEntity" | "updateEntity">;
  entityType: string;
  id: string;
  error: string;
  content?: string;
}

export type FailPendingEntityResult =
  | {
      found: true;
      entityId: string;
      mutation: EntityMutationResult;
      previousEntity: BaseEntity;
    }
  | { found: false };

/**
 * Save processed/enriched output for an async ingestion job.
 *
 * If a pending placeholder exists, update that same entity. If not, create the
 * entity directly. This keeps ingestion jobs compatible with both immediate
 * placeholder flows and older direct-create callers.
 */
export async function saveProcessedEntity({
  entityService,
  entity,
  expectedContentHash,
  stagedAsset,
}: SaveProcessedEntityRequest): Promise<SaveProcessedEntityResult> {
  const previousEntity = await entityService.getEntity({
    entityType: entity.entityType,
    id: entity.id,
    visibilityScope: internalFullScope("pending entity completion"),
    binaryContent: "reference",
  });

  if (previousEntity) {
    const updatedEntity: BaseEntity = {
      ...previousEntity,
      content: entity.content,
      metadata: entity.metadata,
      updated: entity.updated ?? new Date().toISOString(),
    };
    const mutation = await entityService.updateEntity({
      entity: updatedEntity,
      ...(stagedAsset !== undefined ? { stagedAsset } : {}),
      ...(expectedContentHash !== undefined
        ? { options: { expectedContentHash } }
        : {}),
    });
    return {
      entityId: mutation.entityId,
      updated: true,
      mutation,
      previousEntity,
    };
  }

  if (expectedContentHash !== undefined) {
    return {
      entityId: entity.id,
      updated: false,
      mutation: {
        entityId: entity.id,
        jobId: "",
        skipped: true,
        skipReason: "content-conflict",
      },
    };
  }

  const mutation = await entityService.createEntity({
    entity,
    ...(stagedAsset !== undefined ? { stagedAsset } : {}),
  });
  return {
    entityId: mutation.entityId,
    updated: false,
    mutation,
  };
}

/**
 * Mark an existing pending entity as failed while keeping it durable and
 * discoverable for retries or user-facing error reporting.
 */
export async function failPendingEntity({
  entityService,
  entityType,
  id,
  error,
  content,
}: FailPendingEntityRequest): Promise<FailPendingEntityResult> {
  const previousEntity = await entityService.getEntity({
    entityType,
    id,
    visibilityScope: internalFullScope("pending entity failure"),
    // Write the stored reference back, never a materialized copy of it.
    binaryContent: "reference",
  });

  if (!previousEntity) {
    return { found: false };
  }

  const updatedEntity: BaseEntity = {
    ...previousEntity,
    content: content ?? previousEntity.content,
    metadata: {
      ...previousEntity.metadata,
      status: "failed",
      processingError: error,
    },
    updated: new Date().toISOString(),
  };

  const mutation = await entityService.updateEntity({ entity: updatedEntity });

  return {
    found: true,
    entityId: mutation.entityId,
    mutation,
    previousEntity,
  };
}
