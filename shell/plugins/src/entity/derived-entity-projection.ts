import type { BaseEntity, EntityInput } from "@brains/entity-service";
import type { JobHandler, JobOptions } from "@brains/job-queue";
import { getErrorMessage, type Logger } from "@brains/utils";
import type { EntityPluginContext } from "./context";

export interface EntityChangePayload<TEntity extends BaseEntity = BaseEntity> {
  entityType: string;
  entityId?: string;
  entity?: TEntity;
}

export interface ProjectionJobConfig {
  /** Projection job type. Use target-entity scoped names, e.g. "topic:project". */
  type: string;
  handler: JobHandler<string, unknown>;
}

export interface ProjectionInitialSyncConfig {
  /** Durable gate. Return false to skip enqueueing for this process/restart. */
  shouldEnqueue?: () => boolean | Promise<boolean>;
  jobData: unknown;
  jobOptions?: JobOptions | (() => JobOptions | undefined);
}

export type ProjectionSourceKind = "entity" | "conversation";

export interface ProjectionSourceChangeConfig {
  sourceTypes: readonly string[];
  /** Explicit source kind for non-entity projections. Defaults to "entity". */
  sourceKind?: ProjectionSourceKind;
  /** Custom source type override. Defaults to payload.entityType for entity sources or sourceKind for non-entity sources. */
  sourceType?: string;
  events?: readonly string[];
  requireInitialSync?: boolean;
  shouldEnqueue?: (payload: EntityChangePayload) => boolean | Promise<boolean>;
  jobData: (
    payload: EntityChangePayload,
  ) => unknown | null | Promise<unknown | null>;
  jobOptions?: (payload: EntityChangePayload) => JobOptions | undefined;
}

export interface DerivedEntityProjection {
  id: string;
  targetType: string;
  job: ProjectionJobConfig;
  initialSync?: ProjectionInitialSyncConfig;
  sourceChange?: ProjectionSourceChangeConfig;
}

export interface DerivedEntityProjectionController {
  hasObservedInitialSync: () => boolean;
  hasQueuedInitialSync: () => boolean;
}

export function registerDerivedEntityProjection(
  context: EntityPluginContext,
  logger: Logger,
  projection: DerivedEntityProjection,
): DerivedEntityProjectionController {
  let observedInitialSync = false;
  let queuedInitialSync = false;

  context.jobs.registerHandler(projection.job.type, projection.job.handler);

  if (projection.initialSync) {
    const initialSyncConfig = projection.initialSync;
    context.messaging.subscribe(
      "sync:initial:completed",
      async (): Promise<{ success: boolean }> => {
        if (observedInitialSync) return { success: true };
        observedInitialSync = true;

        const shouldEnqueue =
          (await initialSyncConfig.shouldEnqueue?.()) ?? true;
        if (!shouldEnqueue) {
          logger.info("Skipping derived entity projection initial sync", {
            projectionId: projection.id,
            targetType: projection.targetType,
          });
          return { success: true };
        }

        queuedInitialSync = await enqueueProjectionJob(
          context,
          logger,
          projection,
          initialSyncConfig.jobData,
          resolveJobOptions(initialSyncConfig.jobOptions),
          "initial-sync",
        );
        return { success: true };
      },
    );
  }

  if (projection.sourceChange) {
    const sourceChangeConfig = projection.sourceChange;
    const sourceTypes = new Set(sourceChangeConfig.sourceTypes);
    const events = sourceChangeConfig.events ?? [
      "entity:created",
      "entity:updated",
    ];

    const handleChange = async (message: {
      payload: EntityChangePayload;
    }): Promise<{ success: boolean }> => {
      if (sourceChangeConfig.requireInitialSync && !observedInitialSync) {
        return { success: true };
      }

      const payload = message.payload;
      const payloadSourceType = getProjectionSourceType(
        sourceChangeConfig,
        payload,
      );
      if (
        !payloadSourceType ||
        (!sourceTypes.has("*") && !sourceTypes.has(payloadSourceType))
      ) {
        return { success: true };
      }

      const shouldEnqueue =
        (await sourceChangeConfig.shouldEnqueue?.(payload)) ?? true;
      if (!shouldEnqueue) return { success: true };

      const jobData = await sourceChangeConfig.jobData(payload);
      if (!jobData) return { success: true };

      await enqueueProjectionJob(
        context,
        logger,
        projection,
        jobData,
        sourceChangeConfig.jobOptions?.(payload),
        "source-change",
      );
      return { success: true };
    };

    for (const event of events) {
      context.messaging.subscribe(event, handleChange);
    }
  }

  return {
    hasObservedInitialSync: () => observedInitialSync,
    hasQueuedInitialSync: () => queuedInitialSync,
  };
}

function getProjectionSourceType(
  config: ProjectionSourceChangeConfig,
  payload: EntityChangePayload,
): string | undefined {
  if (config.sourceType) return config.sourceType;
  if (config.sourceKind && config.sourceKind !== "entity") {
    return config.sourceKind;
  }
  return payload.entityType;
}

export async function hasPersistedTargets(
  context: EntityPluginContext,
  targetType: string,
): Promise<boolean> {
  const existing = await context.entityService.listEntities({
    entityType: targetType,
    options: {
      limit: 1,
    },
  });
  return existing.length > 0;
}

export interface ReconcileDerivedEntitiesOptions<
  TDesired,
  TEntity extends BaseEntity = BaseEntity,
> {
  context: EntityPluginContext;
  targetType: string;
  desired: Iterable<TDesired>;
  getId: (desired: TDesired) => string;
  toEntityInput: (desired: TDesired, id: string) => EntityInput<TEntity>;
  equals?: (existing: TEntity, desired: TDesired) => boolean;
  deleteStale?: boolean;
  /** Bounded concurrency for create/update/delete. Default 1 — derivation usually fans out DB mutations and message-bus side effects. */
  concurrency?: number;
  /** @deprecated Use concurrency. */
  deleteConcurrency?: number;
  logger?: Logger;
}

export interface ReconcileDerivedEntitiesResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export async function reconcileDerivedEntities<
  TDesired,
  TEntity extends BaseEntity = BaseEntity,
>({
  context,
  targetType,
  desired,
  getId,
  toEntityInput,
  equals,
  deleteStale = false,
  concurrency,
  deleteConcurrency,
  logger,
}: ReconcileDerivedEntitiesOptions<
  TDesired,
  TEntity
>): Promise<ReconcileDerivedEntitiesResult> {
  const desiredById = new Map<string, TDesired>();
  for (const item of desired) {
    desiredById.set(getId(item), item);
  }

  const existing = await context.entityService.listEntities<TEntity>({
    entityType: targetType,
  });
  const existingById = new Map(existing.map((entity) => [entity.id, entity]));

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  const mutationConcurrency = Math.max(
    1,
    concurrency ?? deleteConcurrency ?? 1,
  );

  if (deleteStale) {
    const stale = existing.filter((entity) => !desiredById.has(entity.id));
    await runBounded(stale, mutationConcurrency, async (entity) => {
      await context.entityService.deleteEntity({
        entityType: targetType,
        id: entity.id,
      });
      deleted++;
    });
  }

  for (const [id, item] of desiredById) {
    const existingEntity = existingById.get(id);
    const input = toEntityInput(item, id);

    try {
      if (!existingEntity) {
        await context.entityService.createEntity({ entity: input });
        created++;
        continue;
      }

      if (equals?.(existingEntity, item) ?? false) {
        skipped++;
        continue;
      }

      const updatedEntity: TEntity = {
        ...existingEntity,
        ...input,
        id,
        entityType: targetType,
      };
      await context.entityService.updateEntity({ entity: updatedEntity });
      updated++;
    } catch (error) {
      logger?.error("Failed to reconcile derived entity", {
        targetType,
        id,
        error: getErrorMessage(error),
      });
    }
  }

  return { created, updated, deleted, skipped };
}

async function enqueueProjectionJob(
  context: EntityPluginContext,
  logger: Logger,
  projection: DerivedEntityProjection,
  jobData: unknown,
  options: JobOptions | undefined,
  reason: string,
): Promise<boolean> {
  try {
    await context.jobs.enqueue({
      type: projection.job.type,
      data: jobData,
      ...(options ? { options } : {}),
    });
    logger.info("Queued derived entity projection", {
      projectionId: projection.id,
      targetType: projection.targetType,
      reason,
    });
    return true;
  } catch (error) {
    logger.error("Failed to queue derived entity projection", {
      projectionId: projection.id,
      targetType: projection.targetType,
      reason,
      error: getErrorMessage(error),
    });
    return false;
  }
}

function resolveJobOptions(
  options: JobOptions | (() => JobOptions | undefined) | undefined,
): JobOptions | undefined {
  return typeof options === "function" ? options() : options;
}

async function runBounded<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    await Promise.all(batch.map((item) => run(item)));
  }
}
