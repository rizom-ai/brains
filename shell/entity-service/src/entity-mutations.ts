import { ENTITY_CHANNELS } from "@brains/contracts";
import type { EntityDB } from "./db";
import { EntityMutationReceiptStore } from "./entity-mutation-receipt-store";
import {
  EntityMutationAlreadyAppliedError,
  type EntityMutationReceipt,
  type EntityMutationReceiptKey,
} from "./entity-mutation-receipt";
import { snapshotEntityMutation } from "./entity-mutation-request";
import type { EmbeddingDB } from "./db/embedding-db";
import type {
  AssetTransaction,
  SqliteAssetRepository,
  StagedUpload,
} from "./sqlite-asset-repository";
import type {
  BaseEntity,
  EntityJobOptions,
  EntityMutationEventContext,
  EntityMutationResult,
  EmbeddingBackfillResult,
  EmbeddingIndexStats,
  StoreEmbeddingData,
  EntityEventBus,
  DeleteEntityRequest,
  CreateEntityRequest,
  UpdateEntityRequest,
  FoldEntityRequest,
  ApplyEntityMutationOnceRequest,
  UpsertEntityRequest,
  EntityRegistry,
  EntityMutationAdmission,
} from "./types";
import type { EntitySerializer } from "./entity-serializer";
import type { EntityQueries } from "./entity-queries";
import type { ProjectionStore } from "./projection-store";
import type {
  EntityExportStore,
  EntityExportTransaction,
} from "./entity-export-store";
import type { IJobQueueService } from "@brains/job-queue";
import { createId } from "@brains/utils/id";
import { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import { computeContentHash } from "@brains/utils/hash";
import { entities } from "./schema/entities";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import { EmbeddingIndexCoordinator } from "./embedding-index-coordinator";
import { and, eq, sql } from "drizzle-orm";
import {
  entityWriteConditionSchema,
  EntityWriteConflictError,
} from "./entity-write-contracts";
import {
  assertEntityWriteCondition,
  type EntityWritePrecondition,
} from "./entity-write-state";
import { entityRevision, stableJson } from "./entity-revision";
import {
  isSchemaPhaseValidationError,
  toEntityValidationError,
} from "./errors";

/** Shared by ordinary mutations and atomic projection upserts. */
export async function validatePersist(
  registry: EntityRegistry,
  entity: BaseEntity,
  operation: "create" | "update",
): Promise<void> {
  try {
    await registry.getPersistValidator(entity.entityType)?.(entity, {
      operation,
    });
  } catch (error) {
    // A validator that finds the content itself invalid says so with a
    // schema-phase error, which sync quarantines; any other refusal is a live
    // policy, which sync retries.
    if (isSchemaPhaseValidationError(error)) throw error;
    throw toEntityValidationError(entity.entityType, error, "persist") ?? error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  // Drizzle wraps the LibsqlError, so walk the cause chain
  for (let current = error; current instanceof Error; current = current.cause) {
    if (
      current.message.includes("UNIQUE constraint failed") ||
      current.message.includes("SQLITE_CONSTRAINT")
    ) {
      return true;
    }
  }
  return false;
}

class StaleEntityUpdateError extends Error {}

const foldSourceSchema = z.strictObject({
  entityType: z.string().min(1),
  id: z.string().min(1),
  expectedRevision: z.string().min(1),
});
interface FoldRemoval {
  condition: EntityWritePrecondition;
  prior: BaseEntity;
}

export interface EntityMutationDeps {
  db: EntityDB;
  entityRegistry: EntityRegistry;
  entitySerializer: EntitySerializer;
  entityQueries: EntityQueries;
  jobQueueService: IJobQueueService;
  logger: Logger;
  messageBus?: EntityEventBus;
  mutationAdmission?: EntityMutationAdmission;
  projectionStore: ProjectionStore;
  assetRepository: SqliteAssetRepository;
  entityExportStore: EntityExportStore;
  projectionNow: () => number;
  /** Embedding DB for writes (separate from entity DB). */
  embeddingDb: EmbeddingDB;
  embeddingsEnabled: boolean;
}

/**
 * EntityMutations handles all write operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntityMutations {
  private db: EntityDB;
  private readonly mutationReceipts: EntityMutationReceiptStore;
  private entityRegistry: EntityRegistry;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private messageBus?: EntityEventBus;
  private mutationAdmission?: EntityMutationAdmission;
  private readonly projectionStore: ProjectionStore;
  private readonly assetRepository: SqliteAssetRepository;
  private readonly entityExportStore: EntityExportStore;
  private readonly projectionNow: () => number;
  private readonly embeddingIndex: EmbeddingIndexCoordinator;
  private projectionWakeup: (() => Promise<void>) | undefined;
  private logger: Logger;

  constructor(deps: EntityMutationDeps) {
    this.db = deps.db;
    this.mutationReceipts = new EntityMutationReceiptStore(deps.db);
    this.entityRegistry = deps.entityRegistry;
    this.entitySerializer = deps.entitySerializer;
    this.entityQueries = deps.entityQueries;
    this.projectionStore = deps.projectionStore;
    this.assetRepository = deps.assetRepository;
    this.entityExportStore = deps.entityExportStore;
    this.projectionNow = deps.projectionNow;
    this.logger = deps.logger.child("EntityMutations");
    this.embeddingIndex = new EmbeddingIndexCoordinator({
      entityDb: deps.db,
      embeddingDb: deps.embeddingDb,
      entityRegistry: deps.entityRegistry,
      jobQueueService: deps.jobQueueService,
      logger: this.logger,
      embeddingsEnabled: deps.embeddingsEnabled,
    });
    if (deps.messageBus) {
      this.messageBus = deps.messageBus;
    }
    if (deps.mutationAdmission) {
      this.mutationAdmission = deps.mutationAdmission;
    }
  }

  public setProjectionWakeup(wakeup: () => Promise<void>): () => void {
    this.projectionWakeup = wakeup;
    let active = true;
    return (): void => {
      if (!active) return;
      active = false;
      if (this.projectionWakeup === wakeup) this.projectionWakeup = undefined;
    };
  }

  /**
   * Create a new entity (returns immediately, embedding generated in background)
   */
  public getEntityMutationReceipt(
    key: EntityMutationReceiptKey,
  ): Promise<EntityMutationReceipt | null> {
    return this.mutationReceipts.get(key);
  }

  public async applyEntityMutationOnce(
    input: ApplyEntityMutationOnceRequest,
  ): Promise<{ receipt: EntityMutationReceipt; applied: boolean }> {
    const mutation = snapshotEntityMutation(input);
    const key = mutation.receipt;
    const prior = await this.mutationReceipts.get(key);
    if (prior) return { receipt: prior, applied: false };
    if (mutation.operation === "none")
      return {
        receipt: await this.mutationReceipts.completeWithoutWrite(key),
        applied: false,
      };
    try {
      const result =
        mutation.operation === "create"
          ? await this.writeCreatedEntity(mutation.request, key)
          : await this.writeUpdatedEntity(mutation.request, undefined, key);
      if (result.skipReason === "content-conflict") {
        throw new EntityWriteConflictError(
          mutation.request.entity.entityType,
          result.entityId,
        );
      }
      const receipt = await this.mutationReceipts.get(key);
      if (!receipt)
        throw new Error("Missing committed entity mutation receipt");
      return { receipt, applied: true };
    } catch (error) {
      if (error instanceof EntityMutationAlreadyAppliedError)
        return { receipt: error.receipt, applied: false };
      throw error;
    }
  }

  public createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    return this.writeCreatedEntity(request);
  }

  private async writeCreatedEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
    receipt?: EntityMutationReceiptKey,
  ): Promise<EntityMutationResult> {
    const { entity, options, stagedAsset } = request;
    options?.signal?.throwIfAborted();
    const condition =
      options?.conditionalWrite &&
      entityWriteConditionSchema.parse(options.conditionalWrite);
    if (
      condition &&
      (condition.expectedRevision !== null ||
        options.deduplicateId ||
        !entity.id)
    ) {
      throw new Error(
        "Conditional creation requires an explicit ID, an absent precondition, and no deduplication",
      );
    }
    const precondition: EntityWritePrecondition | undefined = condition
      ? {
          ...condition,
          entityType: entity.entityType,
          entityId: entity.id ?? "",
        }
      : undefined;
    this.logger.debug(
      `Creating entity asynchronously of type: ${entity["entityType"]}`,
    );

    const assertGroupingsCurrent =
      this.entityRegistry.captureGroupingWriteGuard(entity.entityType);
    // Generate ID, timestamps, and contentHash if not provided
    const now = new Date().toISOString();
    const entityWithDefaults = {
      ...entity,
      id: entity.id ?? createId(),
      created: entity.created ?? now,
      updated: entity.updated ?? now,
      contentHash: computeContentHash(entity.content),
    };

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity(
      entity["entityType"],
      entityWithDefaults,
    );

    await validatePersist(this.entityRegistry, validatedEntity, "create");
    options?.signal?.throwIfAborted();

    // Prepare entity for storage
    const { markdown, metadata } =
      this.entitySerializer.prepareEntityForStorage(
        validatedEntity,
        validatedEntity.entityType,
      );

    // Compute contentHash from the serialized markdown
    const contentHash = computeContentHash(markdown);
    const stagedUpload = this.resolveStagedUpload(
      validatedEntity.entityType,
      validatedEntity.content,
      markdown,
      stagedAsset,
    );

    // Resolve final ID (may deduplicate on collision)
    let finalId = validatedEntity.id;
    if (options?.deduplicateId) {
      finalId = await this.resolveUniqueId(
        validatedEntity.id,
        validatedEntity.entityType,
      );
    }

    await this.mutationAdmission?.assertMutationAdmission({
      operation: "create",
      entityType: validatedEntity.entityType,
      entityId: finalId,
    });

    // Persist the entity, search row, and scheduler journal atomically.
    await this.projectionStore.withDirtyInput(
      {
        sourceType: validatedEntity.entityType,
        sourceId: finalId,
        revision: entityRevision({
          contentHash,
          metadata,
          visibility: validatedEntity.visibility,
        }),
        operation: "upsert",
        markedAt: this.projectionNow(),
      },
      async (transaction) => {
        if (receipt)
          await this.mutationReceipts.assertVacant(transaction, receipt);
        if (precondition)
          await assertEntityWriteCondition(
            transaction,
            precondition,
            validatedEntity,
          );
        await this.bindAssetContent(
          transaction,
          validatedEntity.entityType,
          markdown,
          stagedUpload,
        );
        await options?.beforeWrite?.({
          ...validatedEntity,
          id: finalId,
          content: markdown,
          contentHash,
          metadata,
        });
        options?.signal?.throwIfAborted();
        await assertGroupingsCurrent();
        options?.signal?.throwIfAborted();
        // Once the entity write starts, settle the complete atomic mutation.
        await transaction.insert(entities).values({
          id: finalId,
          entityType: validatedEntity.entityType,
          content: markdown,
          contentHash,
          visibility: validatedEntity.visibility,
          metadata,
          created: new Date(validatedEntity.created).getTime(),
          updated: new Date(validatedEntity.updated).getTime(),
        });
        await this.syncFtsIndex(
          transaction,
          finalId,
          validatedEntity.entityType,
          markdown,
        );
        await this.persistEntityExport(
          transaction,
          {
            entityType: validatedEntity.entityType,
            entityId: finalId,
            operation: "upsert",
          },
          options?.persistenceOrigin,
        );
        if (receipt)
          await this.mutationReceipts.record(transaction, receipt, {
            operation: "create",
            entityType: validatedEntity.entityType,
            entityId: finalId,
          });
      },
    );
    await this.notifyProjectionScheduler();

    this.logger.debug(
      `Persisted entity ${validatedEntity.entityType}:${finalId} immediately`,
    );

    await this.emitEntityEvent(
      ENTITY_CHANNELS.created,
      validatedEntity.entityType,
      finalId,
      {
        ...validatedEntity,
        id: finalId,
      },
      undefined,
      options?.eventContext,
    );

    return this.embeddingIndex.enqueue({
      entityId: finalId,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "create",
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.maxRetries !== undefined && {
        maxRetries: options.maxRetries,
      }),
      ...(options?.eventContext && { eventContext: options.eventContext }),
    });
  }

  /**
   * Update an existing entity (returns immediately, embedding generated in background)
   */
  public updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    return this.writeUpdatedEntity(request);
  }

  public async foldEntity(
    request: FoldEntityRequest,
  ): Promise<EntityMutationResult> {
    // Capture the admitted pair before any asynchronous policy/serialization work.
    const source = foldSourceSchema.parse(request.source);
    const targetRevision = z.string().min(1).parse(request.targetRevision);
    const entity = structuredClone(request.entity);
    const options = { ...request.options };
    if (source.entityType !== entity.entityType || source.id === entity.id) {
      throw new Error("A fold requires two distinct entities of the same type");
    }
    options.signal?.throwIfAborted();
    const priorData = await this.entityQueries.getEntityData(
      source.entityType,
      source.id,
      "restricted",
    );
    if (!priorData || entityRevision(priorData) !== source.expectedRevision) {
      throw new EntityWriteConflictError(source.entityType, source.id);
    }
    const prior = await this.entitySerializer.convertToEntity(priorData);
    if (prior?.visibility !== entity.visibility) {
      throw new Error("A fold cannot cross visibility scopes");
    }
    await this.mutationAdmission?.assertMutationAdmission({
      operation: "delete",
      entityType: source.entityType,
      entityId: source.id,
    });
    return this.writeUpdatedEntity(
      {
        entity,
        options: {
          ...options,
          conditionalWrite: { expectedRevision: targetRevision },
        },
      },
      {
        condition: {
          entityType: source.entityType,
          entityId: source.id,
          expectedRevision: source.expectedRevision,
        },
        prior,
      },
    );
  }

  private async writeUpdatedEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
    fold?: FoldRemoval,
    receipt?: EntityMutationReceiptKey,
  ): Promise<EntityMutationResult> {
    const { entity, options, stagedAsset } = request;
    options?.signal?.throwIfAborted();
    const condition =
      options?.conditionalWrite &&
      entityWriteConditionSchema.parse(options.conditionalWrite);
    if (
      condition &&
      (condition.expectedRevision === null ||
        options.expectedContentHash !== undefined)
    ) {
      throw new Error(
        "Conditional replacement requires a revision and cannot combine preconditions",
      );
    }
    const precondition: EntityWritePrecondition | undefined = condition
      ? { ...condition, entityType: entity.entityType, entityId: entity.id }
      : undefined;
    this.logger.debug(
      `Updating entity asynchronously: ${entity.entityType} with ID ${entity.id}`,
    );

    const assertGroupingsCurrent =
      this.entityRegistry.captureGroupingWriteGuard(entity.entityType);
    // Validate and serialize first to compute the new content hash
    const updatedEntity = {
      ...entity,
      updated: new Date().toISOString(),
      contentHash: computeContentHash(entity.content),
    };

    const validatedEntity = this.entityRegistry.validateEntity(
      entity.entityType,
      updatedEntity,
    );

    await validatePersist(this.entityRegistry, validatedEntity, "update");
    options?.signal?.throwIfAborted();

    const { markdown, metadata } =
      this.entitySerializer.prepareEntityForStorage(
        validatedEntity,
        validatedEntity.entityType,
      );

    const contentHash = computeContentHash(markdown);

    // Skip update only when all persisted fields are unchanged. Metadata-only
    // updates can leave serialized markdown/contentHash unchanged for adapters
    // that preserve frontmatter from content, but those DB metadata changes must
    // still persist for filtering/projections.
    const existing = await this.db
      .select({
        contentHash: entities.contentHash,
        visibility: entities.visibility,
        metadata: entities.metadata,
      })
      .from(entities)
      .where(
        and(
          eq(entities.id, validatedEntity.id),
          eq(entities.entityType, validatedEntity.entityType),
        ),
      )
      .limit(1);

    const existingEntity = existing.at(0);

    if (!existingEntity) {
      if (precondition)
        throw new EntityWriteConflictError(
          precondition.entityType,
          precondition.entityId,
        );
      throw new Error(
        `Entity not found: ${validatedEntity.entityType}:${validatedEntity.id}`,
      );
    }

    if (
      options?.expectedContentHash !== undefined &&
      existingEntity.contentHash !== options.expectedContentHash
    ) {
      this.logger.debug(
        `Skipping stale update for ${validatedEntity.entityType}:${validatedEntity.id}`,
      );
      return {
        entityId: validatedEntity.id,
        jobId: "",
        skipped: true,
        skipReason: "content-conflict",
      };
    }

    if (
      fold &&
      (validatedEntity.visibility !== fold.prior.visibility ||
        existingEntity.visibility !== fold.prior.visibility)
    ) {
      throw new EntityWriteConflictError(
        validatedEntity.entityType,
        validatedEntity.id,
      );
    }
    const stagedUpload = this.resolveStagedUpload(
      validatedEntity.entityType,
      validatedEntity.content,
      markdown,
      stagedAsset,
    );

    if (
      !precondition &&
      !receipt &&
      existingEntity.contentHash === contentHash &&
      existingEntity.visibility === validatedEntity.visibility &&
      stableJson(existingEntity.metadata) === stableJson(metadata)
    ) {
      await this.projectionStore.transferEntityAuthority(
        {
          entityType: validatedEntity.entityType,
          id: validatedEntity.id,
        },
        async (transaction) => {
          options?.signal?.throwIfAborted();
          await assertGroupingsCurrent();
          await this.bindAssetContent(
            transaction,
            validatedEntity.entityType,
            markdown,
            stagedUpload,
          );
          options?.signal?.throwIfAborted();
          await this.pruneFtsIndexIfExcluded(
            transaction,
            validatedEntity.id,
            validatedEntity.entityType,
          );
          return this.persistEntityExport(
            transaction,
            {
              entityType: validatedEntity.entityType,
              entityId: validatedEntity.id,
              operation: "upsert",
            },
            options?.persistenceOrigin,
          );
        },
      );
      this.logger.debug(
        `Skipping no-op update for ${validatedEntity.entityType}:${validatedEntity.id}`,
      );
      if (options?.eventContext) {
        await this.emitEntityEvent(
          ENTITY_CHANNELS.updated,
          validatedEntity.entityType,
          validatedEntity.id,
          validatedEntity,
          existingEntity.metadata,
          options.eventContext,
        );
      }
      return { entityId: validatedEntity.id, jobId: "", skipped: true };
    }

    await this.mutationAdmission?.assertMutationAdmission({
      operation: "update",
      entityType: validatedEntity.entityType,
      entityId: validatedEntity.id,
    });

    try {
      await this.projectionStore.withDirtyInputs(
        [
          {
            sourceType: validatedEntity.entityType,
            sourceId: validatedEntity.id,
            revision: entityRevision({
              contentHash,
              metadata,
              visibility: validatedEntity.visibility,
            }),
            operation: "upsert",
            markedAt: this.projectionNow(),
          },
          ...(fold
            ? [
                {
                  sourceType: fold.condition.entityType,
                  sourceId: fold.condition.entityId,
                  revision: `deleted:${fold.condition.expectedRevision}`,
                  operation: "delete" as const,
                  markedAt: this.projectionNow(),
                },
              ]
            : []),
        ],
        async (transaction) => {
          if (receipt)
            await this.mutationReceipts.assertVacant(transaction, receipt);
          if (fold)
            await assertEntityWriteCondition(
              transaction,
              fold.condition,
              fold.prior,
            );
          if (precondition)
            await assertEntityWriteCondition(
              transaction,
              precondition,
              validatedEntity,
            );
          await this.bindAssetContent(
            transaction,
            validatedEntity.entityType,
            markdown,
            stagedUpload,
          );
          await options?.beforeWrite?.({
            ...validatedEntity,
            content: markdown,
            contentHash,
            metadata,
          });
          options?.signal?.throwIfAborted();
          await assertGroupingsCurrent();
          options?.signal?.throwIfAborted();
          // Cancellation after this boundary must not split the entity from its journals.
          const updateResult = await transaction
            .update(entities)
            .set({
              content: markdown,
              contentHash,
              visibility: validatedEntity.visibility,
              metadata,
              updated: new Date(validatedEntity.updated).getTime(),
            })
            .where(
              and(
                eq(entities.id, validatedEntity.id),
                eq(entities.entityType, validatedEntity.entityType),
                options?.expectedContentHash !== undefined
                  ? eq(entities.contentHash, options.expectedContentHash)
                  : undefined,
              ),
            );
          if (
            (condition || options?.expectedContentHash !== undefined) &&
            Number(updateResult.rowsAffected) === 0
          ) {
            if (precondition)
              throw new EntityWriteConflictError(
                precondition.entityType,
                precondition.entityId,
              );
            throw new StaleEntityUpdateError();
          }
          if (fold) {
            await transaction
              .delete(entities)
              .where(
                and(
                  eq(entities.entityType, fold.prior.entityType),
                  eq(entities.id, fold.prior.id),
                ),
              );
            await this.deleteFtsIndex(
              transaction,
              fold.prior.id,
              fold.prior.entityType,
            );
            await this.persistEntityExport(
              transaction,
              {
                entityType: fold.prior.entityType,
                entityId: fold.prior.id,
                operation: "delete",
              },
              options?.persistenceOrigin,
            );
          }
          await this.syncFtsIndex(
            transaction,
            validatedEntity.id,
            validatedEntity.entityType,
            markdown,
          );
          await this.persistEntityExport(
            transaction,
            {
              entityType: validatedEntity.entityType,
              entityId: validatedEntity.id,
              operation: "upsert",
            },
            options?.persistenceOrigin,
          );
          if (receipt)
            await this.mutationReceipts.record(transaction, receipt, {
              operation: "update",
              entityType: validatedEntity.entityType,
              entityId: validatedEntity.id,
            });
        },
      );
    } catch (error) {
      if (!(error instanceof StaleEntityUpdateError)) throw error;
      this.logger.debug(
        `Skipping concurrently stale update for ${validatedEntity.entityType}:${validatedEntity.id}`,
      );
      return {
        entityId: validatedEntity.id,
        jobId: "",
        skipped: true,
        skipReason: "content-conflict",
      };
    }
    // Recoverable cross-database/index and notification work starts only after
    // the entity pair, FTS and both durable journals have committed.
    if (fold)
      await this.embeddingIndex.deleteEmbedding(
        fold.prior.entityType,
        fold.prior.id,
      );
    await this.notifyProjectionScheduler();

    if (fold)
      await this.emitEntityEvent(
        ENTITY_CHANNELS.deleted,
        fold.prior.entityType,
        fold.prior.id,
        fold.prior,
        undefined,
        options?.eventContext,
      );
    this.logger.debug(
      `Updated entity ${validatedEntity.entityType}:${validatedEntity.id} immediately`,
    );

    await this.emitEntityEvent(
      ENTITY_CHANNELS.updated,
      validatedEntity.entityType,
      validatedEntity.id,
      validatedEntity,
      // Prior metadata lets projections (e.g. series) reconcile a moved value
      // such as a changed `seriesName` without a full resync. Already loaded
      // above for the no-op check, so this adds no extra read.
      existingEntity.metadata,
      options?.eventContext,
    );

    return this.embeddingIndex.enqueue({
      entityId: validatedEntity.id,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "update",
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.maxRetries !== undefined && {
        maxRetries: options.maxRetries,
      }),
      ...(options?.eventContext && { eventContext: options.eventContext }),
    });
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(request: DeleteEntityRequest): Promise<boolean> {
    const { entityType, id, options } = request;

    // Fetch prior entity so subscribers can gate on its metadata (e.g. the
    // `seriesName` field that drives the series projection). Without this,
    // every delete forces subscribers into a full resync because they can't
    // tell whether the deleted entity was relevant to them.
    // Authorization belongs to the calling capability. This internal mutation
    // must find the admitted row at every visibility tier, not silently turn a
    // shared/restricted deletion into a public-scoped lookup miss.
    const priorData = await this.entityQueries.getEntityData(
      entityType,
      id,
      "restricted",
    );
    const prior = priorData
      ? ((await this.entitySerializer.convertToEntity(priorData)) ?? undefined)
      : undefined;

    if (priorData) {
      await this.mutationAdmission?.assertMutationAdmission({
        operation: "delete",
        entityType,
        entityId: id,
      });
    }

    if (!priorData) return false;
    const expectedContentHash = options?.expectedContentHash;
    if (
      expectedContentHash !== undefined &&
      priorData.contentHash !== expectedContentHash
    ) {
      return false;
    }

    // Embeddings live in another database and are recoverable by backfill; the
    // entity row, FTS row, and scheduler journal share one atomic transaction.
    await this.embeddingIndex.deleteEmbedding(entityType, id);
    try {
      await this.projectionStore.withDirtyInput(
        {
          sourceType: entityType,
          sourceId: id,
          revision: `deleted:${entityRevision({
            contentHash: priorData.contentHash,
            metadata: priorData.metadata,
            visibility: priorData.visibility,
          })}`,
          operation: "delete",
          markedAt: this.projectionNow(),
        },
        async (transaction) => {
          const deleteResult = await transaction
            .delete(entities)
            .where(
              and(
                eq(entities.entityType, entityType),
                eq(entities.id, id),
                expectedContentHash !== undefined
                  ? eq(entities.contentHash, expectedContentHash)
                  : undefined,
              ),
            );
          if (
            expectedContentHash !== undefined &&
            Number(deleteResult.rowsAffected) === 0
          ) {
            throw new StaleEntityUpdateError();
          }
          await transaction.run(
            sql`DELETE FROM entity_fts WHERE entity_id = ${id} AND entity_type = ${entityType}`,
          );
          await this.persistEntityExport(
            transaction,
            { entityType, entityId: id, operation: "delete" },
            options?.persistenceOrigin,
          );
        },
      );
    } catch (error) {
      if (!(error instanceof StaleEntityUpdateError)) throw error;
      // Changed between the check and the write: nothing was deleted. Its
      // embedding comes back through backfill.
      this.logger.debug(
        `Skipping concurrently stale delete for ${entityType}:${id}`,
      );
      return false;
    }
    await this.notifyProjectionScheduler();

    await this.emitEntityEvent(
      ENTITY_CHANNELS.deleted,
      entityType,
      id,
      prior,
      undefined,
      options?.eventContext,
    );

    return true;
  }

  /**
   * Create or update an entity based on existence
   */
  public async upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }> {
    const { entity, options, stagedAsset } = request;
    this.logger.debug(
      `Upserting entity of type ${entity.entityType} with ID ${entity.id}`,
    );

    if (options?.conditionalWrite) {
      const created = options.conditionalWrite.expectedRevision === null;
      const result = created
        ? await this.createEntity({ entity, options, stagedAsset })
        : await this.updateEntity({ entity, options, stagedAsset });
      return { ...result, created };
    }

    const exists = await this.entityQueries.entityExists(
      entity.entityType,
      entity.id,
    );

    if (exists) {
      const result = await this.updateEntity({
        entity,
        ...(stagedAsset !== undefined && { stagedAsset }),
        ...(options !== undefined && { options }),
      });
      return { ...result, created: false };
    }

    try {
      const result = await this.createEntity({
        entity,
        ...(stagedAsset !== undefined && { stagedAsset }),
        ...(options !== undefined && { options }),
      });
      return { ...result, created: true };
    } catch (error) {
      // A concurrent create can win between the existence check and the
      // insert — fall through to the update path instead of surfacing the
      // raw unique-constraint violation.
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      this.logger.debug(
        `Entity ${entity.entityType}:${entity.id} was created concurrently, updating instead`,
      );
      const result = await this.updateEntity({
        entity,
        ...(stagedAsset !== undefined && { stagedAsset }),
        ...(options !== undefined && { options }),
      });
      return { ...result, created: false };
    }
  }

  /** Reconcile indexes and lifecycle subscribers after atomic projection writes. */
  public async reconcileProjectionTargets(
    targets: readonly ProjectionChangedTarget[],
  ): Promise<void> {
    await Promise.all(
      targets.map(async (target) => {
        if (target.operation === "delete") {
          await this.emitEntityEvent(
            ENTITY_CHANNELS.deleted,
            target.entityType,
            target.entityId,
          );
          await this.embeddingIndex.deleteEmbedding(
            target.entityType,
            target.entityId,
          );
          return;
        }
        if (!target.contentHash) {
          throw new Error(
            `Projection target ${target.entityType}:${target.entityId} has no content hash`,
          );
        }
        await this.emitEntityEvent(
          ENTITY_CHANNELS.updated,
          target.entityType,
          target.entityId,
        );
        await this.embeddingIndex.enqueue({
          entityId: target.entityId,
          entityType: target.entityType,
          contentHash: target.contentHash,
          operation: "update",
        });
      }),
    );
  }

  /**
   * Store embedding for an entity
   * Used by embedding job handler to store embedding in the embeddings table
   * Entity must already exist in entities table
   */
  public async storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    await this.embeddingIndex.store(data);
  }

  public async backfillMissingEmbeddings(): Promise<EmbeddingBackfillResult> {
    return this.embeddingIndex.backfillMissing();
  }

  public async getEmbeddingIndexStats(): Promise<EmbeddingIndexStats> {
    return this.embeddingIndex.getIndexStats();
  }

  private resolveStagedUpload(
    entityType: string,
    entityContent: string,
    storedContent: string,
    stagedAsset: CreateEntityRequest<BaseEntity>["stagedAsset"],
  ): StagedUpload | undefined {
    const assetBacked =
      this.entityRegistry.getEntityTypeConfig(entityType).binaryStorage ===
      "asset";
    if (!stagedAsset) return undefined;
    if (!assetBacked) {
      throw new Error(
        `Entity type ${entityType} is not registered for asset-backed storage`,
      );
    }
    if (
      entityContent !== stagedAsset.ref ||
      storedContent !== stagedAsset.ref
    ) {
      throw new Error(
        `Staged asset ${stagedAsset.ref} does not match canonical ${entityType} content`,
      );
    }
    return this.assetRepository.claimedUpload(stagedAsset);
  }

  private async bindAssetContent(
    transaction: AssetTransaction,
    entityType: string,
    storedContent: string,
    stagedUpload?: StagedUpload,
  ): Promise<void> {
    if (
      this.entityRegistry.getEntityTypeConfig(entityType).binaryStorage !==
      "asset"
    ) {
      return;
    }
    await this.assetRepository.bindEntityContent(
      transaction,
      storedContent,
      stagedUpload,
    );
  }

  /** Synchronize FTS independently from vector embedding policy. */
  private async syncFtsIndex(
    database: Pick<EntityDB, "run">,
    entityId: string,
    entityType: string,
    content: string,
  ): Promise<void> {
    await this.deleteFtsIndex(database, entityId, entityType);
    if (!this.isFullTextSearchable(entityType)) return;
    await database.run(
      sql`INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (${entityId}, ${entityType}, ${content})`,
    );
  }

  private async pruneFtsIndexIfExcluded(
    database: Pick<EntityDB, "run">,
    entityId: string,
    entityType: string,
  ): Promise<void> {
    if (this.isFullTextSearchable(entityType)) return;
    await this.deleteFtsIndex(database, entityId, entityType);
  }

  private async deleteFtsIndex(
    database: Pick<EntityDB, "run">,
    entityId: string,
    entityType: string,
  ): Promise<void> {
    await database.run(
      sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
    );
  }

  private isFullTextSearchable(entityType: string): boolean {
    return (
      this.entityRegistry.getEntityTypeConfig(entityType).fullTextSearchable !==
      false
    );
  }

  /**
   * Find a unique ID by appending -2, -3, etc. if the base ID already exists.
   */
  private async resolveUniqueId(
    baseId: string,
    entityType: string,
  ): Promise<string> {
    const exists = await this.entityQueries.entityExists(entityType, baseId);

    if (!exists) {
      return baseId;
    }

    // Try suffixes -2, -3, ... up to a reasonable limit
    for (let suffix = 2; suffix <= 100; suffix++) {
      const candidateId = `${baseId}-${suffix}`;
      const taken = await this.entityQueries.entityExists(
        entityType,
        candidateId,
      );

      if (!taken) {
        this.logger.debug(`Deduplicated entity ID: ${baseId} → ${candidateId}`);
        return candidateId;
      }
    }

    // Extremely unlikely fallback: append random suffix
    const fallbackId = `${baseId}-${createId().slice(0, 8)}`;
    this.logger.warn(
      `Could not deduplicate entity ID after 100 attempts, using random suffix: ${fallbackId}`,
    );
    return fallbackId;
  }

  public async wakeProjectionScheduler(): Promise<void> {
    await this.notifyProjectionScheduler();
  }

  private async notifyProjectionScheduler(): Promise<void> {
    try {
      await this.projectionWakeup?.();
    } catch (error) {
      // The durable journal remains pending for the next wakeup or restart.
      this.logger.error("Failed to wake projection scheduler", error);
    }
  }

  /**
   * Broadcast an entity lifecycle event via the message bus
   */
  private async emitEntityEvent(
    event: string,
    entityType: string,
    entityId: string,
    entity?: BaseEntity,
    previousMetadata?: BaseEntity["metadata"],
    eventContext?: EntityMutationEventContext,
  ): Promise<void> {
    if (!this.messageBus) {
      return;
    }

    this.logger.debug(`Emitting ${event} for ${entityType}:${entityId}`);

    const payload: Record<string, unknown> = {
      entityType,
      entityId,
      ...(eventContext?.conversationId
        ? { conversationId: eventContext.conversationId }
        : {}),
      ...(eventContext?.channelId ? { channelId: eventContext.channelId } : {}),
      ...(eventContext?.runId ? { runId: eventContext.runId } : {}),
      ...(eventContext?.toolCallId
        ? { toolCallId: eventContext.toolCallId }
        : {}),
      ...(eventContext?.actor ? { actor: eventContext.actor } : {}),
      ...(eventContext?.interfaceType
        ? { interfaceType: eventContext.interfaceType }
        : {}),
    };
    if (entity) {
      payload["entity"] = entity;
    }
    if (previousMetadata) {
      payload["previousMetadata"] = previousMetadata;
    }

    try {
      await this.messageBus.send({
        type: event,
        payload: payload,
        sender: "entity-service",
        broadcast: true,
      });
    } catch (error) {
      // Lifecycle delivery is a wake-up optimization. The durable export and
      // projection journals remain available for startup/periodic recovery.
      this.logger.error(
        `Failed to publish ${event} for ${entityType}:${entityId}`,
        error,
      );
    }
  }

  private async persistEntityExport(
    transaction: EntityExportTransaction,
    target: {
      entityType: string;
      entityId: string;
      operation: "upsert" | "delete";
    },
    origin: EntityJobOptions["persistenceOrigin"],
  ): Promise<void> {
    if (origin === "directory-sync") {
      await this.entityExportStore.clear(transaction, target);
      return;
    }
    await this.entityExportStore.record(transaction, {
      ...target,
      markedAt: this.projectionNow(),
    });
  }
}
