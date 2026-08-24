import {
  internalFullScope,
  type BaseEntity,
  type ContentVisibility,
} from "@brains/plugins";

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
      await deps.deleteEntityFile(intent.entityType, intent.entityId);
      processed.push(intent);
      changedFiles = true;
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
    await deps.writeEntity(entity);
    processed.push(intent);
    changedFiles = true;
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
