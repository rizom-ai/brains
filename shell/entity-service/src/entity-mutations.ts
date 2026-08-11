import { ENTITY_CHANNELS, SHELL_CHANNELS } from "@brains/contracts";
import type { EntityDB } from "./db";
import type {
  BaseEntity,
  EmbeddingJobData,
  EntityJobOptions,
  EntityMutationEventContext,
  EntityMutationResult,
  EmbeddingBackfillResult,
  EmbeddingIndexStats,
  EmbeddingFailureReference,
  StoreEmbeddingData,
  EntityEventBus,
  DeleteEntityRequest,
  CreateEntityRequest,
  UpdateEntityRequest,
  UpsertEntityRequest,
  EntityRegistry,
  EntityMutationAdmission,
} from "./types";
import type { EntitySerializer } from "./entity-serializer";
import type { EntityQueries } from "./entity-queries";
import type { ProjectionStore } from "./projection-store";
import type { EntityJobOutbox } from "./entity-job-outbox";
import type {
  IJobQueueService,
  JobInfo,
  JobQueueEnqueueRequest,
  PreparedJobEnqueue,
} from "@brains/job-queue";
import { createId } from "@brains/utils/id";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { computeContentHash } from "@brains/utils/hash";
import { entities } from "./schema/entities";
import { embeddings } from "./schema/embeddings";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import { and, eq, sql } from "drizzle-orm";

const jsonObjectSchema = z.custom<object>(
  (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value),
);

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : toStableJsonValue(item),
    );
  }

  const parsedObject = jsonObjectSchema.safeParse(value);
  if (parsedObject.success) {
    return Object.fromEntries(
      Object.entries(parsedObject.data)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, toStableJsonValue(item)]),
    );
  }

  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function entityRevision(input: {
  contentHash: string;
  metadata: unknown;
  visibility: string;
}): string {
  return computeContentHash(stableJson(input));
}

const failedEmbeddingJobDataSchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
  contentHash: z.string().min(1),
});

function parseEmbeddingFailureReference(
  job: JobInfo,
): EmbeddingFailureReference | null {
  try {
    const data = failedEmbeddingJobDataSchema.parse(JSON.parse(job.data));
    return {
      entityId: data.id,
      entityType: data.entityType,
      contentHash: data.contentHash,
    };
  } catch {
    return null;
  }
}

function embeddingReferenceKey(reference: EmbeddingFailureReference): string {
  return `${reference.entityType}:${reference.entityId}:${reference.contentHash}`;
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

interface EmbeddingBackfillCandidate {
  id: string;
  entityType: string;
  contentHash: string;
}

interface EmbeddingBackfillCandidates extends EmbeddingIndexStats {
  tableMissing: boolean;
  skipped: number;
  rowsToBackfill: EmbeddingBackfillCandidate[];
}

export interface EntityMutationDeps {
  db: EntityDB;
  entityRegistry: EntityRegistry;
  entitySerializer: EntitySerializer;
  entityQueries: EntityQueries;
  jobQueueService: IJobQueueService;
  jobOutbox: EntityJobOutbox;
  logger: Logger;
  messageBus?: EntityEventBus;
  mutationAdmission?: EntityMutationAdmission;
  projectionStore: ProjectionStore;
  embeddingsEnabled: boolean;
  embeddingDimensions: number;
}

/**
 * EntityMutations handles all write operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntityMutations {
  private db: EntityDB;
  private entityRegistry: EntityRegistry;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private jobQueueService: IJobQueueService;
  private readonly jobOutbox: EntityJobOutbox;
  private messageBus?: EntityEventBus;
  private mutationAdmission?: EntityMutationAdmission;
  private readonly projectionStore: ProjectionStore;
  private readonly embeddingsEnabled: boolean;
  private projectionWakeup: (() => Promise<void>) | undefined;
  private logger: Logger;
  private embeddingDimensions: number;

  constructor(deps: EntityMutationDeps) {
    this.db = deps.db;
    this.entityRegistry = deps.entityRegistry;
    this.entitySerializer = deps.entitySerializer;
    this.entityQueries = deps.entityQueries;
    this.jobQueueService = deps.jobQueueService;
    this.jobOutbox = deps.jobOutbox;
    this.projectionStore = deps.projectionStore;
    this.embeddingsEnabled = deps.embeddingsEnabled;
    this.logger = deps.logger.child("EntityMutations");
    this.embeddingDimensions = z
      .number()
      .int()
      .positive()
      .parse(deps.embeddingDimensions);
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
  public async createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    const { entity, options } = request;
    this.logger.debug(
      `Creating entity asynchronously of type: ${entity["entityType"]}`,
    );

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

    const persistValidator = this.entityRegistry.getPersistValidator(
      validatedEntity.entityType,
    );
    if (persistValidator) {
      await persistValidator(validatedEntity, { operation: "create" });
    }

    // Prepare entity for storage
    const { markdown, metadata } =
      this.entitySerializer.prepareEntityForStorage(
        validatedEntity,
        validatedEntity.entityType,
      );

    // Compute contentHash from the serialized markdown
    const contentHash = computeContentHash(markdown);

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

    const embeddingIntent = this.prepareEmbeddingJob({
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
    const markedAt = Date.now();

    // Persist the entity, scheduler journal, and embedding intent atomically.
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
        markedAt,
      },
      async (transaction) => {
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
        if (embeddingIntent) {
          await this.jobOutbox.persist(transaction, embeddingIntent, markedAt);
        }
      },
    );
    if (embeddingIntent) this.jobOutbox.requestDrain();
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

    return this.embeddingIntentResult(finalId, embeddingIntent);
  }

  /**
   * Update an existing entity (returns immediately, embedding generated in background)
   */
  public async updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    const { entity, options } = request;
    this.logger.debug(
      `Updating entity asynchronously: ${entity.entityType} with ID ${entity.id}`,
    );

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

    const persistValidator = this.entityRegistry.getPersistValidator(
      validatedEntity.entityType,
    );
    if (persistValidator) {
      await persistValidator(validatedEntity, { operation: "update" });
    }

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
      existingEntity.contentHash === contentHash &&
      existingEntity.visibility === validatedEntity.visibility &&
      stableJson(existingEntity.metadata) === stableJson(metadata)
    ) {
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

    const embeddingIntent = this.prepareEmbeddingJob({
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
    const markedAt = Date.now();

    try {
      await this.projectionStore.withDirtyInput(
        {
          sourceType: validatedEntity.entityType,
          sourceId: validatedEntity.id,
          revision: entityRevision({
            contentHash,
            metadata,
            visibility: validatedEntity.visibility,
          }),
          operation: "upsert",
          markedAt,
        },
        async (transaction) => {
          if (existingEntity.contentHash !== contentHash) {
            await transaction
              .delete(embeddings)
              .where(
                and(
                  eq(embeddings.entityType, validatedEntity.entityType),
                  eq(embeddings.entityId, validatedEntity.id),
                ),
              );
          }
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
            options?.expectedContentHash !== undefined &&
            Number(updateResult.rowsAffected) === 0
          ) {
            throw new StaleEntityUpdateError();
          }
          if (embeddingIntent) {
            await this.jobOutbox.persist(
              transaction,
              embeddingIntent,
              markedAt,
            );
          }
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
    if (embeddingIntent) this.jobOutbox.requestDrain();
    await this.notifyProjectionScheduler();

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

    return this.embeddingIntentResult(validatedEntity.id, embeddingIntent);
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
    const priorData = await this.entityQueries.getEntityData(entityType, id);
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

    // The entity, embedding, and scheduler journal share one atomic
    // transaction. The explicit embedding delete also works if FK enforcement
    // is unavailable on a remote libSQL connection.
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
        markedAt: Date.now(),
      },
      async (transaction) => {
        await transaction
          .delete(embeddings)
          .where(
            and(
              eq(embeddings.entityType, entityType),
              eq(embeddings.entityId, id),
            ),
          );
        await transaction
          .delete(entities)
          .where(and(eq(entities.entityType, entityType), eq(entities.id, id)));
      },
    );
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
    const { entity, options } = request;
    this.logger.debug(
      `Upserting entity of type ${entity.entityType} with ID ${entity.id}`,
    );

    const exists = await this.entityQueries.entityExists(
      entity.entityType,
      entity.id,
    );

    if (exists) {
      const result = await this.updateEntity({
        entity,
        ...(options !== undefined && { options }),
      });
      return { ...result, created: false };
    }

    try {
      const result = await this.createEntity({
        entity,
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
        ...(options !== undefined && { options }),
      });
      return { ...result, created: false };
    }
  }

  /** Queue embeddings after atomic projection writes. */
  public async reconcileProjectionTargets(
    targets: readonly ProjectionChangedTarget[],
  ): Promise<void> {
    await Promise.all(
      targets.map(async (target) => {
        if (target.operation === "delete") return;
        if (!target.contentHash) {
          throw new Error(
            `Projection target ${target.entityType}:${target.entityId} has no content hash`,
          );
        }
        await this.enqueueEmbeddingJob({
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
    if (data.embedding.length !== this.embeddingDimensions) {
      throw new RangeError(
        `Expected ${this.embeddingDimensions} embedding dimensions, received ${data.embedding.length}`,
      );
    }

    await this.projectionStore.runDatabaseOperation(() =>
      this.db.transaction(async (transaction) => {
        const current = await transaction
          .select({ contentHash: entities.contentHash })
          .from(entities)
          .where(
            and(
              eq(entities.id, data.entityId),
              eq(entities.entityType, data.entityType),
              eq(entities.contentHash, data.contentHash),
            ),
          )
          .limit(1);
        if (current.length === 0) return;

        await transaction
          .insert(embeddings)
          .values({
            entityId: data.entityId,
            entityType: data.entityType,
            embedding: data.embedding,
            contentHash: data.contentHash,
          })
          .onConflictDoUpdate({
            target: [embeddings.entityId, embeddings.entityType],
            set: {
              embedding: data.embedding,
              contentHash: data.contentHash,
            },
          });
      }),
    );
  }

  public async backfillMissingEmbeddings(): Promise<EmbeddingBackfillResult> {
    if (!this.embeddingsEnabled) {
      this.logger.debug(
        "Skipping embedding backfill; semantic indexing is disabled",
      );
      return { queued: 0, skipped: 0 };
    }

    const candidates = await this.getEmbeddingBackfillCandidates();

    if (candidates.tableMissing) {
      this.logger.debug("Skipping embedding backfill; entities table missing");
      return { queued: 0, skipped: 0 };
    }

    let queued = 0;
    let skipped = candidates.skipped;

    for (const row of candidates.rowsToBackfill) {
      const result = await this.enqueueEmbeddingJob({
        entityId: row.id,
        entityType: row.entityType,
        contentHash: row.contentHash,
        operation: "update",
      });
      if (result.jobId) {
        queued++;
      } else {
        skipped++;
      }
    }

    return { queued, skipped };
  }

  public async getEmbeddingIndexStats(): Promise<EmbeddingIndexStats> {
    const candidates = await this.getEmbeddingBackfillCandidates();
    return {
      missingEmbeddings: candidates.missingEmbeddings,
      staleEmbeddings: candidates.staleEmbeddings,
      failedEmbeddings: candidates.failedEmbeddings,
      embeddableEntities: candidates.embeddableEntities,
      embeddedEntities: candidates.embeddedEntities,
    };
  }

  private async getEmbeddingBackfillCandidates(): Promise<EmbeddingBackfillCandidates> {
    if (!(await this.hasEntityTable())) {
      return {
        tableMissing: true,
        skipped: 0,
        rowsToBackfill: [],
        missingEmbeddings: 0,
        staleEmbeddings: 0,
        failedEmbeddings: 0,
        embeddableEntities: 0,
        embeddedEntities: 0,
      };
    }

    const failedEmbeddingKeys = await this.getFailedEmbeddingKeys();

    const entityRows = await this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        contentHash: entities.contentHash,
      })
      .from(entities);

    const embeddingRows = await this.db
      .select({
        entityId: embeddings.entityId,
        entityType: embeddings.entityType,
        contentHash: embeddings.contentHash,
      })
      .from(embeddings);

    const embeddingHashes = new Map<string, string>();
    for (const row of embeddingRows) {
      embeddingHashes.set(`${row.entityType}:${row.entityId}`, row.contentHash);
    }

    const rowsToBackfill: EmbeddingBackfillCandidate[] = [];
    let skipped = 0;
    let missingEmbeddings = 0;
    let staleEmbeddings = 0;
    let failedEmbeddings = 0;
    let embeddableEntities = 0;
    let embeddedEntities = 0;

    for (const row of entityRows) {
      const entityConfig = this.entityRegistry.getEntityTypeConfig(
        row.entityType,
      );
      if (entityConfig.embeddable === false) {
        skipped++;
        continue;
      }
      embeddableEntities++;

      const failureKey = embeddingReferenceKey({
        entityId: row.id,
        entityType: row.entityType,
        contentHash: row.contentHash,
      });
      const hasTerminalFailure = failedEmbeddingKeys.has(failureKey);
      const embeddingHash = embeddingHashes.get(`${row.entityType}:${row.id}`);
      if (embeddingHash === undefined) {
        if (hasTerminalFailure) {
          failedEmbeddings++;
          skipped++;
        } else {
          missingEmbeddings++;
          rowsToBackfill.push(row);
        }
        continue;
      }

      if (embeddingHash !== row.contentHash) {
        if (hasTerminalFailure) {
          failedEmbeddings++;
          skipped++;
        } else {
          staleEmbeddings++;
          rowsToBackfill.push(row);
        }
        continue;
      }

      embeddedEntities++;
      skipped++;
    }

    return {
      tableMissing: false,
      skipped,
      rowsToBackfill,
      missingEmbeddings,
      staleEmbeddings,
      failedEmbeddings,
      embeddableEntities,
      embeddedEntities,
    };
  }

  private async getFailedEmbeddingKeys(): Promise<Set<string>> {
    const failedJobs = await this.jobQueueService.getFailedJobs([
      SHELL_CHANNELS.embedding,
    ]);
    const failedEmbeddingKeys = new Set<string>();

    for (const job of failedJobs) {
      const reference = parseEmbeddingFailureReference(job);
      if (reference) {
        failedEmbeddingKeys.add(embeddingReferenceKey(reference));
      }
    }

    return failedEmbeddingKeys;
  }

  private async hasEntityTable(): Promise<boolean> {
    const rows = await this.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities'`,
    );
    return rows.length > 0;
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

    await this.messageBus.send({
      type: event,
      payload: payload,
      sender: "entity-service",
      broadcast: true,
    });
  }

  /** Prepare an entity-transactional embedding intent for the owner outbox. */
  private prepareEmbeddingJob(
    params: Omit<EmbeddingJobData, "id"> &
      EntityJobOptions & { entityId: string },
  ): PreparedJobEnqueue | null {
    const request = this.buildEmbeddingJobRequest(params, false);
    return request ? this.jobQueueService.prepareEnqueue(request) : null;
  }

  private embeddingIntentResult(
    entityId: string,
    intent: PreparedJobEnqueue | null,
  ): EntityMutationResult {
    if (!intent) return { entityId, jobId: "", skipped: false };
    this.logger.debug("Recorded durable embedding job intent", {
      entityId,
      jobId: intent.jobId,
    });
    return { entityId, jobId: intent.jobId, skipped: false };
  }

  /** Enqueue repair/projection work whose source already has durable recovery. */
  private async enqueueEmbeddingJob(
    params: Omit<EmbeddingJobData, "id"> &
      EntityJobOptions & { entityId: string },
  ): Promise<EntityMutationResult> {
    const request = this.buildEmbeddingJobRequest(params, true);
    if (!request) {
      return { entityId: params.entityId, jobId: "", skipped: false };
    }

    const jobId = await this.jobQueueService.enqueue(request);
    this.logger.debug(
      `Queued embedding job for ${params.entityType}:${params.entityId} (job: ${jobId})`,
    );
    return { entityId: params.entityId, jobId, skipped: false };
  }

  private buildEmbeddingJobRequest(
    params: Omit<EmbeddingJobData, "id"> &
      EntityJobOptions & { entityId: string },
    deduplicate: boolean,
  ): JobQueueEnqueueRequest | null {
    const {
      entityId,
      entityType,
      contentHash,
      operation,
      priority,
      maxRetries,
      eventContext,
    } = params;
    const entityConfig = this.entityRegistry.getEntityTypeConfig(entityType);
    if (!this.embeddingsEnabled || entityConfig.embeddable === false) {
      this.logger.debug(
        `Skipping embedding for ${
          this.embeddingsEnabled
            ? "non-embeddable entity type"
            : "disabled indexing"
        }: ${entityType}:${entityId}`,
      );
      return null;
    }

    const jobData: EmbeddingJobData = {
      id: entityId,
      entityType,
      contentHash,
      operation,
    };
    return {
      type: SHELL_CHANNELS.embedding,
      data: jobData,
      options: {
        ...(priority !== undefined && { priority }),
        ...(maxRetries !== undefined && { maxRetries }),
        source: "entity-service",
        ...(deduplicate && {
          deduplication: "coalesce" as const,
          deduplicationKey: `embedding:${entityType}:${entityId}:${contentHash}`,
        }),
        metadata: {
          operationType: "data_processing",
          operationTarget: entityId,
          ...(eventContext?.interfaceType
            ? {
                interfaceType: eventContext.interfaceType,
                requestedByInterface: eventContext.interfaceType,
              }
            : {}),
          ...(eventContext?.actor
            ? {
                requestedByActor: eventContext.actor,
                ...(eventContext.actor.kind === "user"
                  ? { requestedByUserId: eventContext.actor.userId }
                  : {}),
              }
            : {}),
          // Embedding jobs are background bookkeeping — suppress progress
          // and completion events (entity:embedding:ready covers consumers)
          silent: true,
        },
      },
    };
  }
}
