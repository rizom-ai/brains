import type { EntityDB } from "./db";
import type { EmbeddingDB } from "./db/embedding-db";
import type {
  BaseEntity,
  EmbeddingJobData,
  EntityJobOptions,
  EntityMutationResult,
  StoreEmbeddingData,
  EntityEventBus,
  DeleteEntityRequest,
  CreateEntityRequest,
  UpdateEntityRequest,
  UpsertEntityRequest,
} from "./types";
import type { EntityRegistry } from "./entityRegistry";
import type { EntitySerializer } from "./entity-serializer";
import type { EntityQueries } from "./entity-queries";
import type { IJobQueueService } from "@brains/job-queue";
import type { Logger } from "@brains/utils";
import { createId } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import { entities } from "./schema/entities";
import { embeddings } from "./schema/embeddings";
import { and, eq, sql } from "drizzle-orm";

export interface EntityMutationDeps {
  db: EntityDB;
  entityRegistry: EntityRegistry;
  entitySerializer: EntitySerializer;
  entityQueries: EntityQueries;
  jobQueueService: IJobQueueService;
  logger: Logger;
  messageBus?: EntityEventBus;
  /** Embedding DB for writes (separate from entity DB). */
  embeddingDb: EmbeddingDB;
}

/**
 * EntityMutations handles all write operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntityMutations {
  private db: EntityDB;
  private embeddingDb: EmbeddingDB;
  private entityRegistry: EntityRegistry;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private jobQueueService: IJobQueueService;
  private messageBus?: EntityEventBus;
  private logger: Logger;

  constructor(deps: EntityMutationDeps) {
    this.db = deps.db;
    this.embeddingDb = deps.embeddingDb;
    this.entityRegistry = deps.entityRegistry;
    this.entitySerializer = deps.entitySerializer;
    this.entityQueries = deps.entityQueries;
    this.jobQueueService = deps.jobQueueService;
    this.logger = deps.logger.child("EntityMutations");
    if (deps.messageBus) {
      this.messageBus = deps.messageBus;
    }
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
    const validatedEntity = this.entityRegistry.validateEntity<T>(
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

    // Write entity to database immediately (without embedding)
    await this.db.insert(entities).values({
      id: finalId,
      entityType: validatedEntity.entityType,
      content: markdown,
      contentHash,
      metadata,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
    });

    // Update FTS5 index
    await this.upsertFtsIndex(finalId, validatedEntity.entityType, markdown);

    this.logger.debug(
      `Persisted entity ${validatedEntity.entityType}:${finalId} immediately`,
    );

    await this.emitEntityEvent(
      "entity:created",
      validatedEntity.entityType,
      finalId,
      {
        ...validatedEntity,
        id: finalId,
      },
    );

    return this.enqueueEmbeddingJob({
      entityId: finalId,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "create",
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.maxRetries !== undefined && {
        maxRetries: options.maxRetries,
      }),
    });
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

    const validatedEntity = this.entityRegistry.validateEntity<T>(
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

    // Skip update if content hasn't changed
    const existing = await this.db
      .select({ contentHash: entities.contentHash })
      .from(entities)
      .where(
        and(
          eq(entities.id, validatedEntity.id),
          eq(entities.entityType, validatedEntity.entityType),
        ),
      )
      .limit(1);

    if (existing[0]?.contentHash === contentHash) {
      this.logger.debug(
        `Skipping no-op update for ${validatedEntity.entityType}:${validatedEntity.id}`,
      );
      return { entityId: validatedEntity.id, jobId: "", skipped: true };
    }

    await this.db
      .update(entities)
      .set({
        content: markdown,
        contentHash,
        metadata,
        updated: new Date(validatedEntity.updated).getTime(),
      })
      .where(
        and(
          eq(entities.id, validatedEntity.id),
          eq(entities.entityType, validatedEntity.entityType),
        ),
      );

    // Update FTS5 index
    await this.upsertFtsIndex(
      validatedEntity.id,
      validatedEntity.entityType,
      markdown,
    );

    this.logger.debug(
      `Updated entity ${validatedEntity.entityType}:${validatedEntity.id} immediately`,
    );

    await this.emitEntityEvent(
      "entity:updated",
      validatedEntity.entityType,
      validatedEntity.id,
      validatedEntity,
    );

    return this.enqueueEmbeddingJob({
      entityId: validatedEntity.id,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "update",
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.maxRetries !== undefined && {
        maxRetries: options.maxRetries,
      }),
    });
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(request: DeleteEntityRequest): Promise<boolean> {
    const { entityType, id } = request;

    // Fetch prior entity so subscribers can gate on its metadata (e.g. the
    // `seriesName` field that drives the series projection). Without this,
    // every delete forces subscribers into a full resync because they can't
    // tell whether the deleted entity was relevant to them.
    const priorData = await this.entityQueries.getEntityData(entityType, id);
    const prior = priorData
      ? ((await this.entitySerializer.convertToEntity(priorData)) ?? undefined)
      : undefined;

    const deleted = await this.entityQueries.deleteEntity(entityType, id);

    if (deleted) {
      await this.emitEntityEvent("entity:deleted", entityType, id, prior);
    }

    return deleted;
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
    } else {
      const result = await this.createEntity({
        entity,
        ...(options !== undefined && { options }),
      });
      return { ...result, created: true };
    }
  }

  /**
   * Store embedding for an entity
   * Used by embedding job handler to store embedding in the embeddings table
   * Entity must already exist in entities table
   */
  public async storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    await this.embeddingDb
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
  }

  /**
   * Insert or replace FTS5 index entry for an entity.
   */
  private async upsertFtsIndex(
    entityId: string,
    entityType: string,
    content: string,
  ): Promise<void> {
    // FTS5 doesn't support upsert — delete then insert
    await this.db.run(
      sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
    );
    await this.db.run(
      sql`INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (${entityId}, ${entityType}, ${content})`,
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

  /**
   * Broadcast an entity lifecycle event via the message bus
   */
  private async emitEntityEvent(
    event: string,
    entityType: string,
    entityId: string,
    entity?: BaseEntity,
  ): Promise<void> {
    if (!this.messageBus) {
      return;
    }

    this.logger.debug(`Emitting ${event} for ${entityType}:${entityId}`);

    const payload: Record<string, unknown> = { entityType, entityId };
    if (entity) {
      payload["entity"] = entity;
    }

    await this.messageBus.send({
      type: event,
      payload: payload,
      sender: "entity-service",
      broadcast: true,
    });
  }

  /**
   * Enqueue an embedding job, or return early if the entity type is non-embeddable
   */
  private async enqueueEmbeddingJob(
    params: Omit<EmbeddingJobData, "id"> &
      EntityJobOptions & { entityId: string },
  ): Promise<EntityMutationResult> {
    const {
      entityId,
      entityType,
      contentHash,
      operation,
      priority,
      maxRetries,
    } = params;

    const entityConfig = this.entityRegistry.getEntityTypeConfig(entityType);
    if (entityConfig.embeddable === false) {
      this.logger.debug(
        `Skipping embedding for non-embeddable entity type: ${entityType}:${entityId}`,
      );
      return { entityId, jobId: "", skipped: false };
    }

    const jobData: EmbeddingJobData = {
      id: entityId,
      entityType,
      contentHash,
      operation,
    };
    const rootJobId = createId();

    const jobId = await this.jobQueueService.enqueue({
      type: "shell:embedding",
      data: jobData,
      options: {
        ...(priority !== undefined && { priority }),
        ...(maxRetries !== undefined && { maxRetries }),
        source: "entity-service",
        rootJobId,
        metadata: {
          operationType: "data_processing" as const,
          operationTarget: entityId,
        },
      },
    });

    this.logger.debug(
      `Queued embedding job for ${entityType}:${entityId} (job: ${jobId})`,
    );

    return { entityId, jobId, skipped: false };
  }
}
