import {
  SerializedStatusStore,
  type IRuntimeStateNamespace,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type {
  BatchMetadata,
  BatchResult,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  IDirectorySync,
  IGitSync,
} from "../types";

const commitSchema = z.string().regex(/^[a-f0-9]{40,64}$/);
const checkpointSchema: z.ZodType<GitReconciliationCheckpoint> = z.object({
  remoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  branch: z.string().min(1).max(200),
  lastReconciledGitHead: commitSchema,
  lastObservedRemoteHead: commitSchema.optional(),
});
const storedCheckpointSchema = z.object({
  checkpoint: checkpointSchema.optional(),
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
  context: ServicePluginContext;
  source: string;
  metadata?: BatchMetadata | undefined;
  signal?: AbortSignal | undefined;
}

const CHECKPOINT_NAMESPACE = "directory-sync.git-reconciliation";
const CHECKPOINT_KEY = "current";

/**
 * Owns the durable handoff from a serialized Git HEAD transition to queued
 * directory work. The checkpoint advances only after the batch is durable.
 */
export class GitReconciliationService {
  private readonly store: SerializedStatusStore<StoredCheckpoint>;

  constructor(runtimeState: IRuntimeStateNamespace) {
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

  saveCheckpoint(checkpoint: GitReconciliationCheckpoint): Promise<void> {
    return this.store.mutate((state) => {
      state.checkpoint = checkpoint;
    });
  }

  /** Capture HEAD after a synchronous full initial sync has completed. */
  async captureCurrent(gitSync: IGitSync): Promise<void> {
    await gitSync.withLock(() => this.captureCurrentUnderLock(gitSync));
  }

  /** Advance after a DB-origin commit while its caller already owns the Git lock. */
  async captureCurrentUnderLock(gitSync: IGitSync): Promise<void> {
    const delta = await gitSync.getReconciliationDelta(undefined);
    await this.saveCheckpoint(delta.checkpoint);
  }

  /** Pull, derive all work since the durable checkpoint, queue, then advance. */
  pullAndQueue(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    return options.gitSync.withLock(async () => {
      await options.gitSync.pull(options.signal);
      options.signal?.throwIfAborted();
      return this.queueCurrentDelta(options);
    }, options.signal);
  }

  /** Replay an already-mutated checkout during startup without another pull. */
  replayAndQueue(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    return options.gitSync.withLock(
      () => this.queueCurrentDelta(options),
      options.signal,
    );
  }

  private async queueCurrentDelta(
    options: QueueReconciliationOptions,
  ): Promise<GitReconciliationResult> {
    const previous = await this.getCheckpoint();
    const delta = await options.gitSync.getReconciliationDelta(previous);

    if (delta.mode === "full") {
      const batch = await options.directorySync.queueSyncBatch(
        options.context,
        options.source,
        options.metadata,
      );
      const checkpointAdvanced = batch !== null;
      if (checkpointAdvanced) await this.saveCheckpoint(delta.checkpoint);
      return {
        mode: delta.mode,
        files: [],
        deletedFiles: [],
        batch,
        checkpointAdvanced,
      };
    }

    if (delta.files.length === 0 && delta.deletedFiles.length === 0) {
      await this.saveCheckpoint(delta.checkpoint);
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
      delta.files,
      delta.deletedFiles,
    );
    if (batch) {
      options.directorySync.suppressWatchPaths(delta.files);
      await this.saveCheckpoint(delta.checkpoint);
    }

    return {
      mode: delta.mode,
      files: delta.files,
      deletedFiles: delta.deletedFiles,
      batch,
      checkpointAdvanced: batch !== null,
    };
  }
}
