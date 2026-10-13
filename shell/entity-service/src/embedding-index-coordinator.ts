import { SHELL_CHANNELS } from "@brains/contracts";
import type { IJobQueueService, JobInfo } from "@brains/job-queue";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { and, eq, sql } from "drizzle-orm";
import type { EntityDB } from "./db";
import type { EmbeddingDB } from "./db/embedding-db";
import { embeddings } from "./schema/embeddings";
import { entities } from "./schema/entities";
import type {
  EmbeddingBackfillResult,
  EmbeddingFailureReference,
  EmbeddingIndexStats,
  EmbeddingJobData,
  EntityJobOptions,
  EntityMutationResult,
  EntityRegistry,
  StoreEmbeddingData,
} from "./types";

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
    // Unreadable job data yields no reference and cannot suppress a retry.
    return null;
  }
}

function embeddingReferenceKey(reference: EmbeddingFailureReference): string {
  return `${reference.entityType}:${reference.entityId}:${reference.contentHash}`;
}

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

export interface EnqueueEmbeddingInput
  extends Omit<EmbeddingJobData, "id">, EntityJobOptions {
  entityId: string;
}

export interface EmbeddingIndexCoordinatorOptions {
  entityDb: EntityDB;
  embeddingDb: EmbeddingDB;
  entityRegistry: EntityRegistry;
  jobQueueService: IJobQueueService;
  logger: Logger;
  embeddingsEnabled: boolean;
}

/** Owns recoverable embedding persistence, queueing, and readiness statistics. */
export class EmbeddingIndexCoordinator {
  private readonly entityDb: EntityDB;
  private readonly embeddingDb: EmbeddingDB;
  private readonly entityRegistry: EntityRegistry;
  private readonly jobQueueService: IJobQueueService;
  private readonly logger: Logger;
  private readonly embeddingsEnabled: boolean;

  public constructor(options: EmbeddingIndexCoordinatorOptions) {
    this.entityDb = options.entityDb;
    this.embeddingDb = options.embeddingDb;
    this.entityRegistry = options.entityRegistry;
    this.jobQueueService = options.jobQueueService;
    this.logger = options.logger;
    this.embeddingsEnabled = options.embeddingsEnabled;
  }

  public async deleteEmbedding(
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.embeddingDb
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.entityType, entityType),
          eq(embeddings.entityId, entityId),
        ),
      );
  }

  public async store(data: StoreEmbeddingData): Promise<void> {
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

  public async backfillMissing(): Promise<EmbeddingBackfillResult> {
    if (!this.embeddingsEnabled) {
      this.logger.debug(
        "Skipping embedding backfill; semantic indexing is disabled",
      );
      return { queued: 0, skipped: 0 };
    }

    const candidates = await this.getBackfillCandidates();
    if (candidates.tableMissing) {
      this.logger.debug("Skipping embedding backfill; entities table missing");
      return { queued: 0, skipped: 0 };
    }

    let queued = 0;
    let skipped = candidates.skipped;
    for (const row of candidates.rowsToBackfill) {
      const result = await this.enqueue({
        entityId: row.id,
        entityType: row.entityType,
        contentHash: row.contentHash,
        operation: "update",
      });
      if (result.jobId) queued++;
      else skipped++;
    }

    return { queued, skipped };
  }

  public async getIndexStats(): Promise<EmbeddingIndexStats> {
    const candidates = await this.getBackfillCandidates();
    return {
      missingEmbeddings: candidates.missingEmbeddings,
      staleEmbeddings: candidates.staleEmbeddings,
      failedEmbeddings: candidates.failedEmbeddings,
      embeddableEntities: candidates.embeddableEntities,
      embeddedEntities: candidates.embeddedEntities,
    };
  }

  public async enqueue(
    input: EnqueueEmbeddingInput,
  ): Promise<EntityMutationResult> {
    const {
      entityId,
      entityType,
      contentHash,
      operation,
      priority,
      maxRetries,
      eventContext,
    } = input;

    const entityConfig = this.entityRegistry.getEntityTypeConfig(entityType);
    if (!this.embeddingsEnabled || entityConfig.embeddable === false) {
      this.logger.debug(
        `Skipping embedding for ${
          this.embeddingsEnabled
            ? "non-embeddable entity type"
            : "disabled indexing"
        }: ${entityType}:${entityId}`,
      );
      return { entityId, jobId: "", skipped: false };
    }

    const jobData: EmbeddingJobData = {
      id: entityId,
      entityType,
      contentHash,
      operation,
    };
    const jobId = await this.jobQueueService.enqueue({
      type: SHELL_CHANNELS.embedding,
      data: jobData,
      options: {
        ...(priority !== undefined && { priority }),
        ...(maxRetries !== undefined && { maxRetries }),
        source: "entity-service",
        deduplication: "coalesce",
        deduplicationKey: `embedding:${entityType}:${entityId}:${contentHash}`,
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
          silent: true,
        },
      },
    });

    this.logger.debug(
      `Queued embedding job for ${entityType}:${entityId} (job: ${jobId})`,
    );
    return { entityId, jobId, skipped: false };
  }

  private async getBackfillCandidates(): Promise<EmbeddingBackfillCandidates> {
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
    const entityRows = await this.entityDb
      .select({
        id: entities.id,
        entityType: entities.entityType,
        contentHash: entities.contentHash,
      })
      .from(entities);
    const embeddingRows = await this.embeddingDb
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
    const rows = await this.entityDb.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities'`,
    );
    return rows.length > 0;
  }
}
