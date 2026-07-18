import { actorRefSchema } from "@brains/contracts";
import type {
  BaseEntity,
  IRuntimeStateStore,
  ServicePluginContext,
} from "@brains/plugins";
import { updateFrontmatterField } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";
import type { QueueEntry, QueueManager } from "./queue-manager";
import {
  SYSTEM_PUBLISH_AUTH_CONTEXT,
  type PublishAuthContext,
} from "./types/messages";

const QUEUE_STATE_NAMESPACE = "content-pipeline.queue.v1";
const RANK_STEP = 1024;
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export interface PublicationQueueRecord {
  entityType: string;
  entityId: string;
  rank: number;
  queuedAt: string;
  contentHashAtEnqueue: string;
  authContext: PublishAuthContext;
  revision: number;
}

const publishAuthContextSchema: z.ZodType<
  PublishAuthContext,
  PublishAuthContext
> = z.object({
  interfaceType: z.string().optional(),
  actor: actorRefSchema.optional(),
  userPermissionLevel: z.enum(["public", "trusted", "anchor"]).optional(),
  authorization: z.enum(["user", "system"]).optional(),
});

const publicationQueueRecordSchema: z.ZodType<
  PublicationQueueRecord,
  PublicationQueueRecord
> = z.object({
  entityType: z.string(),
  entityId: z.string(),
  rank: z.number().int().positive(),
  queuedAt: z.string().datetime(),
  contentHashAtEnqueue: z.string(),
  authContext: publishAuthContextSchema,
  revision: z.number().int().positive(),
});

/**
 * Coordinates durable publication intent with recoverable operational order.
 * Entity status owns membership; runtimeState owns rank and enqueue metadata.
 */
export class PublicationQueueService {
  private readonly context: ServicePluginContext;
  private readonly queueManager: QueueManager;
  private readonly store: IRuntimeStateStore<PublicationQueueRecord>;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(context: ServicePluginContext, queueManager: QueueManager) {
    this.context = context;
    this.queueManager = queueManager;
    this.store = context.runtimeState.scoped({
      namespace: QUEUE_STATE_NAMESPACE,
      schema: publicationQueueRecordSchema,
    });
  }

  async add(
    entityType: string,
    entityId: string,
    authContext: PublishAuthContext = SYSTEM_PUBLISH_AUTH_CONTEXT,
  ): Promise<{ position: number }> {
    return this.enqueue(entityType, entityId, authContext);
  }

  async enqueue(
    entityType: string,
    entityId: string,
    authContext: PublishAuthContext = SYSTEM_PUBLISH_AUTH_CONTEXT,
  ): Promise<{ position: number }> {
    return this.runExclusive(async () => {
      const entity = await this.requireEntity(entityType, entityId);
      await this.persistStatus(entity, "queued");
      const result = await this.queueManager.add(
        entityType,
        entityId,
        authContext,
      );
      const existing = await this.store.get(recordKey(entityType, entityId));
      if (!existing) {
        const queueEntry = (await this.queueManager.list(entityType)).find(
          (entry) => entry.entityId === entityId,
        );
        const storedEntity = await this.requireEntity(entityType, entityId);
        await this.store.set(recordKey(entityType, entityId), {
          entityType,
          entityId,
          rank: result.position * RANK_STEP,
          queuedAt: queueEntry?.queuedAt ?? new Date().toISOString(),
          contentHashAtEnqueue: storedEntity.contentHash,
          authContext: { ...authContext },
          revision: 1,
        });
      }
      return result;
    });
  }

  async remove(entityType: string, entityId: string): Promise<void> {
    await this.runExclusive(async () => {
      const entity = await this.requireEntity(entityType, entityId);
      if (entity.metadata["status"] === "queued") {
        await this.persistStatus(entity, "draft");
      }
      await this.queueManager.remove(entityType, entityId);
      await this.store.delete(recordKey(entityType, entityId));
      await this.persistCurrentOrder(entityType);
    });
  }

  async reorder(
    entityType: string,
    entityId: string,
    position: number,
  ): Promise<void> {
    await this.runExclusive(async () => {
      await this.requireEntity(entityType, entityId);
      await this.queueManager.reorder(entityType, entityId, position);
      await this.persistCurrentOrder(entityType);
    });
  }

  async complete(entityType: string, entityId: string): Promise<void> {
    await this.runExclusive(async () => {
      await this.queueManager.remove(entityType, entityId);
      await this.store.delete(recordKey(entityType, entityId));
      await this.persistCurrentOrder(entityType);
    });
  }

  async fail(
    entityType: string,
    entityId: string,
    error: string,
  ): Promise<void> {
    await this.runExclusive(async () => {
      const entity = await this.context.entityService.getEntity({
        entityType,
        id: entityId,
      });
      if (entity) await this.persistStatus(entity, "failed", error);
      await this.queueManager.remove(entityType, entityId);
      await this.store.delete(recordKey(entityType, entityId));
      await this.persistCurrentOrder(entityType);
    });
  }

  /** Rebuild the in-memory projection and repair recoverable runtime records. */
  async reconcile(entityTypes: string[]): Promise<void> {
    await this.runExclusive(async () => {
      const queuedEntities = new Map<string, BaseEntity>();
      for (const entityType of entityTypes) {
        const entities = await this.context.entityService.listEntities({
          entityType,
          options: { filter: { metadata: { status: "queued" } } },
        });
        for (const entity of entities) {
          queuedEntities.set(recordKey(entityType, entity.id), entity);
        }
      }

      const stored = await this.listStored();
      for (const record of stored) {
        if (
          !queuedEntities.has(recordKey(record.entityType, record.entityId))
        ) {
          await this.store.delete(
            recordKey(record.entityType, record.entityId),
          );
        }
      }

      const surviving = (await this.listStored()).filter((record) =>
        queuedEntities.has(recordKey(record.entityType, record.entityId)),
      );
      const nextRankByType = new Map<string, number>();
      for (const record of surviving) {
        nextRankByType.set(
          record.entityType,
          Math.max(nextRankByType.get(record.entityType) ?? 0, record.rank),
        );
      }
      for (const [key, entity] of queuedEntities) {
        if (
          surviving.some(
            (record) => recordKey(record.entityType, record.entityId) === key,
          )
        ) {
          continue;
        }
        const rank = (nextRankByType.get(entity.entityType) ?? 0) + RANK_STEP;
        nextRankByType.set(entity.entityType, rank);
        await this.store.set(key, {
          entityType: entity.entityType,
          entityId: entity.id,
          rank,
          queuedAt:
            typeof entity.updated === "string"
              ? entity.updated
              : new Date().toISOString(),
          contentHashAtEnqueue: entity.contentHash,
          authContext: { ...SYSTEM_PUBLISH_AUTH_CONTEXT },
          revision: 1,
        });
      }

      const records = await this.listStored();
      const positions = new Map<string, number>();
      const entries: QueueEntry[] = records.map((record) => {
        const position = (positions.get(record.entityType) ?? 0) + 1;
        positions.set(record.entityType, position);
        return {
          entityType: record.entityType,
          entityId: record.entityId,
          position,
          queuedAt: record.queuedAt,
          authContext: { ...record.authContext },
        };
      });
      this.queueManager.replace(entries);
    });
  }

  async listStored(entityType?: string): Promise<PublicationQueueRecord[]> {
    return (await this.store.list())
      .map((record) => record.value)
      .filter((record) => !entityType || record.entityType === entityType)
      .sort(
        (left, right) =>
          left.entityType.localeCompare(right.entityType) ||
          left.rank - right.rank ||
          left.queuedAt.localeCompare(right.queuedAt) ||
          left.entityId.localeCompare(right.entityId),
      );
  }

  async deleteStored(entityType: string, entityId: string): Promise<boolean> {
    return this.store.delete(recordKey(entityType, entityId));
  }

  private async persistCurrentOrder(entityType: string): Promise<void> {
    const records = new Map(
      (await this.listStored(entityType)).map((record) => [
        record.entityId,
        record,
      ]),
    );
    for (const entry of await this.queueManager.list(entityType)) {
      const record = records.get(entry.entityId);
      if (!record) continue;
      const rank = entry.position * RANK_STEP;
      if (record.rank === rank) continue;
      await this.store.set(recordKey(entityType, entry.entityId), {
        ...record,
        rank,
        revision: record.revision + 1,
      });
    }
  }

  private async persistStatus(
    entity: BaseEntity,
    status: "draft" | "queued" | "failed",
    error?: string,
  ): Promise<void> {
    const metadata: Record<string, unknown> = { ...entity.metadata, status };
    if (error) metadata["error"] = error;
    else delete metadata["error"];
    const content = FRONTMATTER_BLOCK.test(entity.content)
      ? updateFrontmatterField(entity.content, "status", status)
      : entity.content;
    await this.context.entityService.updateEntity({
      entity: { ...entity, metadata, content },
    });
  }

  private async requireEntity(
    entityType: string,
    entityId: string,
  ): Promise<BaseEntity> {
    const entity = await this.context.entityService.getEntity({
      entityType,
      id: entityId,
    });
    if (!entity) throw new Error(`Entity not found: ${entityType}:${entityId}`);
    return entity;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function recordKey(entityType: string, entityId: string): string {
  return `${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}
