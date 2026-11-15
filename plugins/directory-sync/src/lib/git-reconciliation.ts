import type { DirectorySyncCore } from "./sync-context";
import {
  SerializedStatusStore,
  type ClassRuntimeState,
} from "@brains/sdk/internal/service-runtime";
import { createId } from "@brains/utils/id";
import { z } from "@brains/utils/zod";
import type {
  BatchMetadata,
  BatchResult,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  IDirectorySync,
  IGitSync,
} from "../types";
import { gitReconciliationCheckpointSchema } from "../types/results";
import type { MatchesHead } from "./file-watcher";

const storedCheckpointSchema = z.object({
  checkpoint: gitReconciliationCheckpointSchema.optional(),
  /**
   * The registered entity types the last scan covered. Files of a type
   * registered since were skipped while the checkpoint moved past them, so
   * a different set (or none recorded) makes the next sync a full scan.
   */
  entityTypes: z.array(z.string()).optional(),
  /** Set when a sync's files may not have been imported; cleared by a full scan. */
  fullScanRequest: z.string().optional(),
});

type StoredCheckpoint = z.infer<typeof storedCheckpointSchema>;

export interface GitReconciliationResult {
  mode: GitReconciliationDelta["mode"];
  files: string[];
  deletedFiles: string[];
  batch: BatchResult | null;
  checkpointAdvanced: boolean;
}

interface QueueReconciliationOptions {
  gitSync: IGitSync;
  directorySync: IDirectorySync;
  context: DirectorySyncCore;
  source: string;
  /** Queue every file rather than the delta since the durable checkpoint. */
  full?: boolean | undefined;
  /**
   * Plugins are still registering, so the entity-type registry is partial.
   * A rescan now would skip every type registered later; it waits for the
   * next sync, which the partial types recorded here then trigger.
   */
  entityTypesIncomplete?: boolean | undefined;
  metadata?: BatchMetadata | undefined;
  signal?: AbortSignal | undefined;
  onGitProgress?: (() => void) | undefined;
}

const CHECKPOINT_NAMESPACE = "directory-sync.git-reconciliation";
const CHECKPOINT_KEY = "current";

/**
 * Owns the durable handoff from a serialized Git HEAD transition to queued
 * directory work. The checkpoint advances only after the batch is durable.
 */
/** The paths whose working-tree state is what HEAD holds. */
function matchingHead(gitSync: IGitSync): MatchesHead {
  return async (paths) => {
    const status = await gitSync.getStatus();
    if (!status.isRepo) return [];
    const differing = new Set(status.files.map((file) => file.path));
    return paths.filter((path) => !differing.has(path));
  };
}

export class GitReconciliationService {
  private readonly store: SerializedStatusStore<StoredCheckpoint>;

  constructor(runtimeState: ClassRuntimeState) {
    this.store = new SerializedStatusStore({
      runtimeState,
      namespace: CHECKPOINT_NAMESPACE,
      key: CHECKPOINT_KEY,
      schema: storedCheckpointSchema,
      createEmpty: (): StoredCheckpoint => ({}),
    });
  }

  async getCheckpoint(): Promise<GitReconciliationCheckpoint | undefined> {
    return (await this.store.snapshot()).checkpoint;
  }

  /**
   * Advance the checkpoint. Without entity types, as for the brain's own
   * pushes, the types the last scan covered stay as they were.
   */
  saveCheckpoint(
    checkpoint: GitReconciliationCheckpoint,
    entityTypes?: readonly string[],
  ): Promise<void> {
    return this.store.mutate((state) => {
      state.checkpoint = checkpoint;
      if (entityTypes) state.entityTypes = sortedTypes(entityTypes);
    });
  }

  /**
   * Make the next sync rescan every file. For work that was queued past the
   * checkpoint but may not have been imported: a failed startup batch, or an
   * import a worker could not perform. Shared runtime state, so any process
   * of this brain can ask.
   */
  requireFullScan(): Promise<void> {
    return this.store.mutate((state) => {
      state.fullScanRequest = createId();
    });
  }

  /** Pull, derive all work since the durable checkpoint, queue, then advance. */
  async pullAndQueue(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    // Safe to compose: the delta is derived from the durable checkpoint to
    // current HEAD, so an interleaved commit widens it rather than skipping
    // it, and the checkpoint only advances once the batch is durable.
    await options.gitSync.pull(options.signal, options.onGitProgress);
    options.signal?.throwIfAborted();
    return this.queueCurrentDelta(options);
  }

  /** Replay an already-mutated checkout during startup without another pull. */
  replayAndQueue(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    return this.queueCurrentDelta(options);
  }

  private async queueCurrentDelta(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    // The lease used to refuse a cancelled turn on the caller's behalf. It is
    // gone, so refusing is this method's job: nothing below is worth starting
    // once the caller has given up on it.
    options.signal?.throwIfAborted();
    const entityTypes = sortedTypes(
      options.context.entityService.getEntityTypes(),
    );
    const stored = await this.store.snapshot();
    const complete = options.entityTypesIncomplete !== true;
    const rescan =
      options.full === true ||
      (complete &&
        (stored.fullScanRequest !== undefined ||
          !sameTypes(stored.entityTypes, entityTypes)));
    const delta = await options.gitSync.getReconciliationDelta(
      rescan ? undefined : stored.checkpoint,
    );
    const advance = (checkpoint: GitReconciliationCheckpoint): Promise<void> =>
      this.store.mutate((state) => {
        state.checkpoint = checkpoint;
        state.entityTypes = entityTypes;
        // A request made while this scan was queued still needs its own.
        if (
          complete &&
          delta.mode === "full" &&
          state.fullScanRequest === stored.fullScanRequest
        ) {
          delete state.fullScanRequest;
        }
      });

    if (delta.mode === "full") {
      const batch = await options.directorySync.queueSyncBatch(
        options.context,
        options.source,
        options.metadata,
      );
      const checkpointAdvanced = batch !== null;
      if (checkpointAdvanced) await advance(delta.checkpoint);
      return {
        mode: delta.mode,
        files: [],
        deletedFiles: [],
        batch,
        checkpointAdvanced,
      };
    }

    // Auto-sync commits the brain's own exports, so the delta lists them
    // again; a file that is already its stored entity has nothing to import.
    const files =
      delta.files.length === 0
        ? []
        : await options.directorySync.withoutStoredEchoes(delta.files);
    if (files.length === 0 && delta.deletedFiles.length === 0) {
      if (delta.files.length > 0) {
        options.directorySync.ignorePulledWatchPaths(
          delta.files,
          matchingHead(options.gitSync),
        );
      }
      await advance(delta.checkpoint);
      return {
        mode: delta.mode,
        files: [],
        deletedFiles: [],
        batch: null,
        checkpointAdvanced: true,
      };
    }

    await options.directorySync.recordPendingPullDeletes(delta.deletedFiles);
    const batch = await options.directorySync.queueSyncBatch(
      options.context,
      options.source,
      options.metadata,
      files,
      delta.deletedFiles,
    );
    if (batch) {
      // The batch imports and deletes what the pull changed; the watcher
      // seeing the same files, however late, is an echo while they match HEAD.
      options.directorySync.ignorePulledWatchPaths(
        delta.files,
        matchingHead(options.gitSync),
      );
      await advance(delta.checkpoint);
    }

    return {
      mode: delta.mode,
      files,
      deletedFiles: delta.deletedFiles,
      batch,
      checkpointAdvanced: batch !== null,
    };
  }
}

function sortedTypes(types: readonly string[]): string[] {
  return [...new Set(types)].sort();
}

function sameTypes(
  recorded: readonly string[] | undefined,
  current: readonly string[],
): boolean {
  return (
    recorded?.length === current.length &&
    recorded.every((type, index) => type === current[index])
  );
}
