import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
} from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import { Cause, Effect, Exit } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import type { EntityPluginContext } from "./context";

export interface ReconcileEntitiesOptions<
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
  outputVisibility?: ContentVisibility;
  concurrency?: number;
  logger?: Logger;
}

export interface ReconcileEntitiesResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}

/** Reconcile command-owned entities. Scheduler rules return write intents instead. */
export async function reconcileEntities<
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
  outputVisibility = "public",
  concurrency = 1,
  logger,
}: ReconcileEntitiesOptions<
  TDesired,
  TEntity
>): Promise<ReconcileEntitiesResult> {
  const desiredById = new Map<string, TDesired>();
  for (const item of desired) desiredById.set(getId(item), item);

  const existing = (
    await context.entityService.listEntities<TEntity>({
      entityType: targetType,
      options: { filter: { visibilityScope: outputVisibility } },
    })
  ).filter((entity) => entity.visibility === outputVisibility);
  const existingById = new Map(existing.map((entity) => [entity.id, entity]));

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  const mutationConcurrency = Math.max(1, concurrency);

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

  await runBounded(
    Array.from(desiredById),
    mutationConcurrency,
    async ([id, item]) => {
      const existingEntity = existingById.get(id);
      const input = {
        ...toEntityInput(item, id),
        visibility: outputVisibility,
      };

      try {
        if (!existingEntity) {
          await context.entityService.createEntity({ entity: input });
          created++;
          return;
        }
        if (equals?.(existingEntity, item) ?? false) {
          skipped++;
          return;
        }

        await context.entityService.updateEntity({
          entity: {
            ...existingEntity,
            ...input,
            id,
            entityType: targetType,
            visibility: outputVisibility,
          },
        });
        updated++;
      } catch (error) {
        logger?.error("Failed to reconcile entity", {
          targetType,
          id,
          error: getErrorMessage(error),
        });
      }
    },
  );

  return { created, updated, deleted, skipped };
}

async function runBounded<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const exit = await Effect.runPromiseExit(
    Effect.forEach(
      items,
      (item) =>
        Effect.tryPromise({
          try: () => run(item),
          catch: (error) => error,
        }),
      { concurrency, discard: true },
    ),
  );
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
}
