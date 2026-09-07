import {
  internalFullScope,
  type BaseEntity,
  type ContentVisibility,
} from "@brains/sdk/entities";

import { EntityPlacementError } from "./entity-placement-error";

/** Refused IDs cannot become exportable by retrying; other failures stay pending. */
async function materialize(effect: () => Promise<void>): Promise<boolean> {
  try {
    await effect();
    return true;
  } catch (error) {
    if (!(error instanceof EntityPlacementError)) throw error;
    return false;
  }
}

export interface DurableEntityExportIntent {
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  revision: string;
  markedAt: number;
}

export interface DurableEntityExportDeps<TCheckpoint = unknown> {
  listPendingEntityExports(): Promise<DurableEntityExportIntent[]>;
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility;
  }): Promise<BaseEntity | null>;
  writeEntity(entity: BaseEntity): Promise<void>;
  deleteEntityFile(entityType: string, entityId: string): Promise<void>;
  isPendingRemoteDelete(entityType: string, entityId: string): boolean;
  commitAndPush?(): Promise<{
    pushed: boolean;
    checkpoint: TCheckpoint | null;
  }>;
  saveCheckpoint?(checkpoint: TCheckpoint): Promise<void>;
  acknowledgeEntityExports(request: {
    intents: readonly DurableEntityExportIntent[];
  }): Promise<number>;
}

export interface DurableEntityExportResult {
  processed: number;
  acknowledged: number;
  pushed: boolean;
}

/**
 * Materialize the latest durable entity mutations and acknowledge them only
 * after the directory's Git checkpoint has crossed those file writes.
 */
export async function drainDurableEntityExports<TCheckpoint = unknown>(
  deps: DurableEntityExportDeps<TCheckpoint>,
): Promise<DurableEntityExportResult> {
  const pending = await deps.listPendingEntityExports();
  const processed: DurableEntityExportIntent[] = [];
  let changedFiles = false;

  for (const intent of pending) {
    if (deps.isPendingRemoteDelete(intent.entityType, intent.entityId)) {
      processed.push(intent);
      continue;
    }

    if (intent.operation === "delete") {
      const changed = await materialize(() =>
        deps.deleteEntityFile(intent.entityType, intent.entityId),
      );
      processed.push(intent);
      changedFiles ||= changed;
      continue;
    }

    const entity = await deps.getEntity({
      entityType: intent.entityType,
      id: intent.entityId,
      visibilityScope: internalFullScope(
        "directory sync drains durable exports across all visibility tiers",
      ),
    });
    if (!entity) {
      throw new Error(
        `Durable entity export cannot resolve upsert target ${intent.entityType}:${intent.entityId} at revision ${intent.revision}`,
      );
    }
    const changed = await materialize(() => deps.writeEntity(entity));
    processed.push(intent);
    changedFiles ||= changed;
  }

  let pushed = false;
  if (changedFiles && deps.commitAndPush) {
    const result = await deps.commitAndPush();
    pushed = result.pushed;
    if (result.checkpoint === null) {
      throw new Error(
        "Git export did not return a confirmed checkpoint; durable intents remain pending",
      );
    }
    if (!deps.saveCheckpoint) {
      throw new Error(
        "Git export checkpoint persistence is unavailable; durable intents remain pending",
      );
    }
    await deps.saveCheckpoint(result.checkpoint);
  }

  const acknowledged = await deps.acknowledgeEntityExports({
    intents: processed,
  });
  return { processed: processed.length, acknowledged, pushed };
}
