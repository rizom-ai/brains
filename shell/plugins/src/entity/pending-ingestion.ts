import {
  internalFullScope,
  type BaseEntity,
  type ContentVisibility,
  type CreateEntityOptions,
  type EntityInput,
  type EntityMutationResult,
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
  }): Promise<BaseEntity | null>;
  createEntity(request: {
    entity: EntityInput<BaseEntity>;
    options?: CreateEntityOptions | undefined;
  }): Promise<EntityMutationResult>;
  updateEntity(request: {
    entity: BaseEntity;
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
 * idempotent and returns the existing entity without modifying it.
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
