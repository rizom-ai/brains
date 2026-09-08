import {
  defineServicePlugin,
  type AnySubscriptionDefinition,
  type ServiceLifecycle,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { DirectorySyncHost } from "./host";
import {
  coverImageConvertJob,
  directoryCleanupJob,
  directoryDeleteJob,
  directoryExportJob,
  directoryImportJob,
  directorySyncJob,
  inlineImageConvertJob,
  syncRequestJob,
} from "./jobs";
import { DirectorySync } from "./lib/directory-sync";
import { connectGitSync } from "./lib/broker/connect";
import type { BrokerGitSync } from "./lib/broker/git-sync-client";
import {
  createBrokerHealthCheck,
  probeBrokerActivity,
  resolveBrokerProgressTimeoutMs,
} from "./lib/broker/health";
import { resolveGitRemoteUrl } from "./lib/git-options";
import {
  createOwnerRecoveryReplay,
  createOwnerReplacementHandler,
} from "./lib/git-owner-replacement";
import {
  directorySyncConfigSchema,
  type DirectorySyncConfig,
  type IDirectorySync,
  type IGitSync,
} from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import {
  CoverImageConversionJobHandler,
  DirectoryCleanupJobHandler,
  DirectoryDeleteJobHandler,
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
  DirectorySyncJobHandler,
  DirectorySyncRequestJobHandler,
  InlineImageConversionJobHandler,
} from "./handlers";
import { entityActivitySubscriptions, setupFileWatcher } from "./lib/auto-sync";
import { initialSyncSubscription } from "./lib/initial-sync";
import { validateSeedContentEntityTypes } from "./lib/file-discovery";
import { setupPeriodicGitSync } from "./lib/git-periodic-sync";
import { DurableEntityExportDispatcher } from "./lib/durable-entity-export-dispatcher";
import { bootstrapContentRemoteFromSeed } from "./lib/content-remote-bootstrap";
import { directorySyncSubscriptions } from "./lib/message-handlers";
import { createDirectorySyncTools } from "./tools";
import { DirectorySyncOperationStatusService } from "./lib/directory-sync-operation-status";
import { GitReconciliationService } from "./lib/git-reconciliation";
import { PendingDeleteRegistry } from "./lib/pending-delete-registry";
import {
  DirectorySyncWorkspaceProvider,
  directorySyncWorkspace,
  syncNowAction,
} from "./lib/studio-workspace";
import {
  DirectorySyncRuntime,
  type DirectorySyncScheduler,
} from "./lib/directory-sync-runtime";
import {
  createDirectorySyncFacade,
  createGitSyncFacade,
} from "./lib/active-sync-facades";
import "./types/job-augmentation";

export function resolveRuntimeSyncPath(options: {
  configuredSyncPath: string | undefined;
  dataDir: string;
  gitConfigured: boolean;
  gitBrokerCheckout: string | undefined;
}): string {
  if (options.gitConfigured) {
    if (!options.gitBrokerCheckout) {
      throw new Error(
        "Git sync is configured but the broker checkout path is unavailable",
      );
    }
    return options.gitBrokerCheckout;
  }
  return options.configuredSyncPath ?? options.dataDir;
}

/** What a recovered, interrupted pull is told as its recovery plays out. */
interface InterruptedPull {
  readonly id: string;
}

/**
 * Everything directory-sync holds while it runs: the active generation of
 * mirror and git client, the services around them, and the means to
 * replace the generation when the sync path is reconfigured.
 */
export class DirectorySyncState {
  readonly host: DirectorySyncHost;
  readonly config: DirectorySyncConfig;
  readonly logger: Logger;
  readonly operationStatus: DirectorySyncOperationStatusService;
  readonly gitReconciliation: GitReconciliationService;
  readonly syncPath: string;
  readonly gitConfigured: boolean;
  readonly directorySyncFacade: IDirectorySync = createDirectorySyncFacade(() =>
    this.requireDirectorySync(),
  );
  readonly gitSyncFacade: IGitSync = createGitSyncFacade(() =>
    this.requireGitSync(),
  );
  readonly pendingDeletes: PendingDeleteRegistry = new PendingDeleteRegistry();

  directorySync: DirectorySync | undefined;
  gitSync: IGitSync | undefined;
  runtime: DirectorySyncRuntime = new DirectorySyncRuntime();
  entityExportDispatcher: DurableEntityExportDispatcher | undefined;
  workspaceProvider: DirectorySyncWorkspaceProvider | undefined;
  interruptedPull: InterruptedPull | undefined;
  readyState = false;
  shutdownStarted = false;
  watcherOwned = false;
  gitBackgroundStarted = false;
  private configurationQueue: Promise<void> = Promise.resolve();
  private readonly runtimeScheduler: DirectorySyncScheduler = {
    scheduleTrailing: (key, delayMs, operation): void => {
      this.runtime.scheduleTrailing(key, delayMs, operation);
    },
  };

  constructor(host: DirectorySyncHost, config: DirectorySyncConfig) {
    this.host = host;
    this.config = config;
    this.logger = host.logger;
    this.gitConfigured =
      config.git !== undefined &&
      (config.git.repo !== undefined || config.git.gitUrl !== undefined);
    this.syncPath = resolveRuntimeSyncPath({
      configuredSyncPath: config.syncPath,
      dataDir: host.dataDir,
      gitConfigured: this.gitConfigured,
      gitBrokerCheckout: host.gitBroker.checkout,
    });
    const runtimeState = { scoped: host.state };
    this.operationStatus = new DirectorySyncOperationStatusService(
      runtimeState,
      host.jobs,
      this.logger.child("OperationStatus"),
      this.syncPath,
    );
    this.gitReconciliation = new GitReconciliationService(runtimeState);
  }

  get isScheduler(): boolean {
    return this.host.role === "scheduler";
  }

  requireDirectorySync(): DirectorySync {
    if (!this.directorySync) {
      throw new Error("DirectorySync service not initialized");
    }
    return this.directorySync;
  }

  requireGitSync(): IGitSync {
    if (!this.gitSync) throw new Error("GitSync service not initialized");
    return this.gitSync;
  }

  requireEntityExportDispatcher(): DurableEntityExportDispatcher {
    if (!this.entityExportDispatcher) {
      throw new Error("Durable entity-export dispatcher is unavailable");
    }
    return this.entityExportDispatcher;
  }

  /** Whether git integration has a configured repository. */
  hasGitSync(): boolean {
    return this.gitSync !== undefined;
  }

  createDirectorySync(syncPath: string): DirectorySync {
    return new DirectorySync(
      {
        syncPath,
        autoSync: this.config.autoSync,
        watchInterval: this.config.watchInterval,
        includeMetadata: this.config.includeMetadata,
        entityTypes: this.config.entityTypes,
        deleteOnFileRemoval: this.config.deleteOnFileRemoval,
        maxImportFileBytes: this.config.maxImportFileBytes,
        entityService: this.host.mirror,
        logger: this.host.logger,
      },
      this.pendingDeletes,
    );
  }

  createEntityExportDispatcher(
    runtime: DirectorySyncRuntime,
    directorySync: DirectorySync,
    gitSync: IGitSync | undefined,
  ): DurableEntityExportDispatcher {
    return new DurableEntityExportDispatcher({
      runtime,
      directorySync,
      entityService: this.host.mirror,
      gitSync,
      ...(gitSync
        ? {
            saveCheckpoint: (checkpoint) =>
              this.gitReconciliation.saveCheckpoint(checkpoint),
          }
        : {}),
      operationStatus: this.operationStatus,
      logger: this.logger.child("EntityExportDispatcher"),
      debounceMs: this.config.commitDebounce,
    });
  }

  bindCleanupAdmission(
    directorySync: DirectorySync,
    dispatcher?: DurableEntityExportDispatcher,
  ): void {
    if (dispatcher) {
      directorySync.setCleanupAdmission(() => dispatcher.settleBeforeCleanup());
      return;
    }
    directorySync.setCleanupAdmission(async () => {
      if (await this.host.mirror.hasPendingEntityExports()) {
        throw new Error(
          "Directory cleanup blocked by pending durable entity exports",
        );
      }
    });
  }

  async bootstrapContentRemote(): Promise<void> {
    const git = this.config.git;
    if (!git) return;
    await bootstrapContentRemoteFromSeed({
      gitUrl: git.gitUrl,
      branch: git.branch,
      seedContentPath: this.config.seedContentPath,
      bootstrapFromSeed: git.bootstrapFromSeed,
      authorName: git.authorName,
      authorEmail: git.authorEmail,
      logger: this.logger.child("ContentRemoteBootstrap"),
    });
  }

  /**
   * Reach the checkout's owner. This role executes no Git itself, and there
   * is no in-process path to fall back to: a missing socket fails setup
   * rather than quietly making this process a second owner.
   *
   * The token stays in this role's configuration and never reaches the
   * broker; the broker resolves its own authenticated remote from the same
   * brain.yaml.
   */
  async connectToGitBroker(
    syncPath: string,
    directorySync: DirectorySync,
  ): Promise<BrokerGitSync> {
    const git = this.config.git;
    if (!git) throw new Error("Git configuration is unavailable");

    const attached: { gitSync?: BrokerGitSync } = {};
    // Only a scheduling role reconciles. Connection loss schedules the work
    // immediately; waiting for a later Git call could leave a quiet checkout
    // closed forever after replacement.
    const replacementRecovery = this.isScheduler
      ? createOwnerReplacementHandler({
          logger: this.logger.child("GitOwner"),
          scheduler: this.runtimeScheduler,
          replay: createOwnerRecoveryReplay({
            client: (): BrokerGitSync | undefined => attached.gitSync,
            replay: async (client): Promise<void> => {
              await this.gitReconciliation.replayAndQueue({
                gitSync: client,
                directorySync,
                context: this.host,
                source: "broker-replacement-replay",
              });
            },
          }),
        })
      : undefined;

    const gitSync = await connectGitSync({
      socketPath: this.host.gitBroker.socket,
      checkoutPath: syncPath,
      branch: git.branch,
      remoteUrl: resolveGitRemoteUrl({
        logger: this.logger,
        dataDir: syncPath,
        repo: git.repo,
        gitUrl: git.gitUrl,
      }),
      logger: this.logger.child("GitSync"),
      ...(replacementRecovery
        ? {
            onOwnerUnavailable: (): void => {
              replacementRecovery("pending replacement");
            },
          }
        : {}),
    });
    attached.gitSync = gitSync;
    return gitSync;
  }

  /**
   * Account for whatever the previous owner left, then reopen admission.
   *
   * Replaying from the durable checkpoint queues anything that reached the
   * checkout without being enqueued, and queues nothing if the lost
   * operation never landed. Only reads are needed for that, which is why the
   * broker keeps them open while it holds mutations.
   */
  async reconcileInheritedWork(
    gitSync: BrokerGitSync,
    directorySync: DirectorySync,
  ): Promise<void> {
    if (await gitSync.admitsMutations()) return;
    this.logger.warn(
      "Git owner is holding mutations; reconciling inherited work",
    );
    await this.gitReconciliation.replayAndQueue({
      gitSync,
      directorySync,
      context: this.host,
      source: "inherited-work-replay",
    });
    await gitSync.openAdmission();
  }

  async startBackgroundWork(): Promise<void> {
    const directorySync = this.requireDirectorySync();
    if (this.config.autoSync && !this.watcherOwned) {
      await this.runtime.acquire(
        () => directorySync.startWatching(),
        () => directorySync.stopWatching(),
      );
      this.watcherOwned = true;
    }

    const gitSync = this.gitSync;
    if (!gitSync || this.gitBackgroundStarted) return;
    if (this.config.autoSync) {
      setupPeriodicGitSync(
        gitSync,
        directorySync,
        this.host,
        this.config.syncInterval,
        this.logger.child("GitPeriodicSync"),
        this.runtime,
        this.gitReconciliation,
        this.operationStatus,
      );
    }
    this.gitBackgroundStarted = true;
  }

  async stopGeneration(
    runtime: DirectorySyncRuntime,
    directorySync: DirectorySync | undefined,
    gitSync: IGitSync | undefined,
  ): Promise<void> {
    const failures: unknown[] = [];
    try {
      await runtime.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await directorySync?.stopWatching();
    } catch (error) {
      failures.push(error);
    }
    try {
      await gitSync?.cleanup();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) throw failures[0];
  }

  private async abandonCandidate(
    runtime: DirectorySyncRuntime,
    directorySync: DirectorySync,
    gitSync: IGitSync | undefined,
  ): Promise<void> {
    try {
      await runtime.close();
    } catch {
      // Preserve the candidate acquisition failure.
    }
    try {
      await directorySync.stopWatching();
    } catch {
      // Preserve the candidate acquisition failure.
    }
    try {
      await gitSync?.cleanup();
    } catch {
      // Preserve the candidate acquisition failure.
    }
  }

  /** Point the mirror at another directory, replacing the whole generation. */
  configure(options: { syncPath: string }): Promise<void> {
    const replacement = this.configurationQueue.then(() =>
      this.replaceGeneration(options.syncPath),
    );
    this.configurationQueue = replacement.catch(() => {});
    return replacement;
  }

  private async replaceGeneration(syncPath: string): Promise<void> {
    if (this.shutdownStarted) {
      throw new Error("Directory sync plugin is shutting down");
    }

    const candidateRuntime = new DirectorySyncRuntime();
    const candidateDirectorySync = this.createDirectorySync(syncPath);
    let candidateGitSync: BrokerGitSync | undefined;
    let candidateDispatcher: DurableEntityExportDispatcher | undefined;

    try {
      await candidateDirectorySync.initializeDirectory();
      if (this.config.autoSync) {
        setupFileWatcher(
          this.host,
          candidateDirectorySync,
          syncPath,
          this.operationStatus,
        );
      }
      if (this.gitConfigured) {
        candidateGitSync = await this.connectToGitBroker(
          syncPath,
          candidateDirectorySync,
        );
        await this.reconcileInheritedWork(
          candidateGitSync,
          candidateDirectorySync,
        );
        await candidateGitSync.initialize();
      }
      candidateDispatcher = this.createEntityExportDispatcher(
        candidateRuntime,
        candidateDirectorySync,
        candidateGitSync,
      );
      this.bindCleanupAdmission(candidateDirectorySync, candidateDispatcher);
    } catch (error) {
      await this.abandonCandidate(
        candidateRuntime,
        candidateDirectorySync,
        candidateGitSync,
      );
      throw error;
    }

    const previousRuntime = this.runtime;
    const previousDirectorySync = this.directorySync;
    const previousGitSync = this.gitSync;
    try {
      await this.stopGeneration(
        previousRuntime,
        previousDirectorySync,
        previousGitSync,
      );
    } catch (error) {
      await this.abandonCandidate(
        candidateRuntime,
        candidateDirectorySync,
        candidateGitSync,
      );
      throw error;
    }

    // Publish the complete candidate atomically after the old generation can
    // no longer enqueue work.
    this.runtime = candidateRuntime;
    this.directorySync = candidateDirectorySync;
    this.gitSync = candidateGitSync;
    this.entityExportDispatcher = candidateDispatcher;
    this.operationStatus.setSyncPath(syncPath);
    this.watcherOwned = false;
    this.gitBackgroundStarted = false;

    if (candidateGitSync) {
      await this.gitReconciliation.replayAndQueue({
        gitSync: candidateGitSync,
        directorySync: candidateDirectorySync,
        context: this.host,
        source: "reconfigure-replay",
      });
    }
    if (this.readyState) {
      await this.requireEntityExportDispatcher().start();
      await this.startBackgroundWork();
    }
    this.logger.info("Directory sync reconfigured", { path: syncPath });
  }

  async shutdown(): Promise<void> {
    this.shutdownStarted = true;
    await this.configurationQueue;
    await this.stopGeneration(this.runtime, this.directorySync, this.gitSync);
    this.readyState = false;
    this.watcherOwned = false;
    this.gitBackgroundStarted = false;
    this.entityExportDispatcher = undefined;
  }
}

/**
 * Bring a generation up: the directory, the git client when configured, the
 * inherited-work reconciliation only a scheduler does, and the dispatcher
 * that drains exports. Setup in both roles; a worker connects to run jobs
 * and never opens admission.
 */
async function bringUp(
  state: DirectorySyncState,
  lifecycle: ServiceLifecycle,
): Promise<void> {
  const { host, config, logger, operationStatus } = state;
  state.directorySync = state.createDirectorySync(state.syncPath);
  try {
    await state.directorySync.initializeDirectory();
    logger.debug("Directory structure initialized", { path: state.syncPath });
  } catch (error) {
    logger.error("Failed to initialize directory", error);
    throw error;
  }

  const interruptedPull = await operationStatus.initialize();
  state.interruptedPull = interruptedPull ?? undefined;

  if (state.isScheduler && config.autoSync) {
    setupFileWatcher(
      host,
      state.directorySync,
      state.syncPath,
      operationStatus,
    );
  }

  if (config.git && !state.gitConfigured) {
    logger.debug(
      "Git block present but no repo/gitUrl configured — git sync disabled",
    );
  }

  if (state.gitConfigured) {
    let connectedGitSync: BrokerGitSync;
    try {
      if (state.isScheduler) await state.bootstrapContentRemote();
      connectedGitSync = await state.connectToGitBroker(
        state.syncPath,
        state.requireDirectorySync(),
      );
      state.gitSync = connectedGitSync;
    } catch (error) {
      if (state.isScheduler && interruptedPull) {
        await operationStatus.finishInterruptedPull(interruptedPull.id, {
          recovered: false,
          message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
        });
      }
      throw error;
    }
    // Reconciling queues a batch, and the queue only knows this package's
    // jobs once the runtime has bound them — after setup. So the rest of the
    // git bring-up waits for registration to complete, still ahead of the
    // brain's startup signal that runs the initial sync.
    lifecycle.onRegistered(async () => {
      // A replacement owner holds mutations until someone has accounted for
      // what the lost generation left. Only a scheduling role can do that —
      // the queue and the checkpoint live here — and only one of them
      // should, so the worker never opens admission.
      if (state.isScheduler) {
        await state.reconcileInheritedWork(
          connectedGitSync,
          state.requireDirectorySync(),
        );
      }
      // `initialize` can clone, checkout, and configure the repository. It
      // is intentionally after inherited-work replay: a replacement starts
      // with mutation admission closed, so doing this first would prevent
      // the role from ever reaching the reconciliation that opens it.
      await connectedGitSync.initialize();
      logger.info("Git integration enabled", { repo: config.git?.repo });

      if (!state.isScheduler || config.initialSync) return;
      try {
        if (interruptedPull) {
          await operationStatus.markProgress(interruptedPull.id);
        }
        await state.gitReconciliation.replayAndQueue({
          gitSync: connectedGitSync,
          directorySync: state.requireDirectorySync(),
          context: host,
          source: "startup-replay",
        });
        if (interruptedPull) {
          await operationStatus.finishInterruptedPull(interruptedPull.id, {
            recovered: true,
            message: "Recovered interrupted Git handoff during startup",
          });
        }
      } catch (error) {
        if (interruptedPull) {
          await operationStatus.finishInterruptedPull(interruptedPull.id, {
            recovered: false,
            message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
          });
        }
        throw error;
      }
    });
  } else if (state.isScheduler && interruptedPull) {
    await operationStatus.finishInterruptedPull(interruptedPull.id, {
      recovered: false,
      message:
        "Interrupted Git handoff recovery requires a configured repository",
    });
  }

  if (state.isScheduler) {
    const dispatcher = state.createEntityExportDispatcher(
      state.runtime,
      state.requireDirectorySync(),
      state.gitSync,
    );
    state.entityExportDispatcher = dispatcher;
    state.bindCleanupAdmission(state.requireDirectorySync(), dispatcher);
    state.workspaceProvider = new DirectorySyncWorkspaceProvider({
      host,
      config,
      getDirectorySync: (): DirectorySync => state.requireDirectorySync(),
      getGitSync: (): IGitSync | undefined => state.gitSync,
      operationStatus,
    });
  } else {
    state.bindCleanupAdmission(state.requireDirectorySync());
  }
}

/** The recovery an interrupted pull is told about while initial sync runs. */
function initialSyncRecovery(
  state: DirectorySyncState,
): Parameters<typeof initialSyncSubscription>[6] {
  const interruptedPull = state.interruptedPull;
  if (!interruptedPull || !state.gitSync) return undefined;
  const { operationStatus } = state;
  return {
    onGitProgress: operationStatus.createProgressObserver(interruptedPull.id),
    onGitRecoverySucceeded: (): Promise<void> =>
      operationStatus.finishInterruptedPull(interruptedPull.id, {
        recovered: true,
        message: "Recovered interrupted Git handoff during initial sync",
      }),
    onGitRecoveryFailed: (error): Promise<void> =>
      operationStatus.finishInterruptedPull(interruptedPull.id, {
        recovered: false,
        message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
      }),
  };
}

/**
 * Directory sync: the brain's records on disk and, when configured, in a git
 * checkout the broker owns. Every entity type is imported from and exported
 * to files as the type's own adapter says; nothing here declares a type.
 */
/**
 * What a caller supplies rather than letting the service build it. Only
 * tests pass these; production leaves them unset.
 */
export interface DirectorySyncDeps {
  /** Told the state once setup built it, so a test can reach the mirror. */
  readonly onState?: ((state: DirectorySyncState) => void) | undefined;
}

export function directorySyncService(
  deps: DirectorySyncDeps = {},
): ServicePackageDefinition<typeof directorySyncConfigSchema> {
  return defineServicePlugin(
    {
      id: "directory-sync",
      config: directorySyncConfigSchema,

      setup: async ({
        config,
        entityMirror,
        jobs,
        messaging,
        runtimeState,
        logger,
        dataDir,
        role,
        gitBroker,
        lifecycle,
      }): Promise<DirectorySyncState> => {
        const host: DirectorySyncHost = {
          mirror: entityMirror,
          jobs,
          messaging,
          state: runtimeState,
          logger,
          dataDir,
          role,
          gitBroker,
        };
        const state = new DirectorySyncState(host, config);
        deps.onState?.(state);
        await bringUp(state, lifecycle);
        lifecycle.onCleanup(() => state.shutdown());
        return state;
      },
    },
    {
      // The status template, formatted as the status formatter always did.
      templates: {
        status: {
          schema: directorySyncStatusSchema,
          format: ({ value }) =>
            new DirectorySyncStatusFormatter().format(value),
        },
      },

      // Every job the sweeps file, bound to the handlers that run them. The
      // four that run as a child of a durable bulk mutation settle it once the
      // queue has recorded where they ended.
      jobs: ({ state }) => {
        const { host, logger, operationStatus } = state;
        const child = (name: string): Logger => logger.child(name);
        const directorySync = state.directorySyncFacade;
        const syncHandler = new DirectorySyncJobHandler(
          child("DirectorySyncJobHandler"),
          host,
          () => state.requireDirectorySync(),
        );
        const exportHandler = new DirectoryExportJobHandler(
          child("DirectoryExportJobHandler"),
          host,
          directorySync,
          operationStatus,
        );
        const importHandler = new DirectoryImportJobHandler(
          child("DirectoryImportJobHandler"),
          host,
          directorySync,
          operationStatus,
        );
        const deleteHandler = new DirectoryDeleteJobHandler(
          child("DirectoryDeleteJobHandler"),
          host,
          directorySync,
        );
        const cleanupHandler = new DirectoryCleanupJobHandler(
          child("DirectoryCleanupJobHandler"),
          host,
          directorySync,
        );
        const coverImageHandler = new CoverImageConversionJobHandler(
          host,
          child("CoverImageConversionJobHandler"),
        );
        const inlineImageHandler = new InlineImageConversionJobHandler(
          host,
          child("InlineImageConversionJobHandler"),
        );
        const bindings = [
          directorySyncJob.handle(({ input, jobId, progress }) =>
            syncHandler.process(input, jobId, progress),
          ),
          directoryExportJob.handle(({ input, jobId, progress }) =>
            exportHandler.process(input, jobId, progress),
          ),
          directoryImportJob.handle(
            ({ input, jobId, progress }) =>
              importHandler.process(input, jobId, progress),
            {
              settled: ({ input, jobId, outcome, error }) =>
                outcome === "completed"
                  ? importHandler.onTerminalSuccess(input, jobId)
                  : importHandler.onTerminalError(
                      error ?? new Error("Import failed"),
                      input,
                      jobId,
                    ),
            },
          ),
          directoryDeleteJob.handle(
            ({ input, jobId, progress }) =>
              deleteHandler.process(input, jobId, progress),
            {
              settled: ({ input, jobId, outcome, error }) =>
                outcome === "completed"
                  ? deleteHandler.onTerminalSuccess(input, jobId)
                  : deleteHandler.onTerminalError(
                      error ?? new Error("Delete failed"),
                      input,
                      jobId,
                    ),
            },
          ),
          directoryCleanupJob.handle(
            ({ input, jobId, progress }) =>
              cleanupHandler.process(input, jobId, progress),
            {
              settled: ({ input, jobId, outcome, error }) =>
                outcome === "completed"
                  ? cleanupHandler.onTerminalSuccess(input, jobId)
                  : cleanupHandler.onTerminalError(
                      error ?? new Error("Cleanup failed"),
                      input,
                      jobId,
                    ),
            },
          ),
          coverImageConvertJob.handle(({ input, jobId, progress }) =>
            coverImageHandler.process(input, jobId, progress),
          ),
          inlineImageConvertJob.handle(({ input, jobId, progress }) =>
            inlineImageHandler.process(input, jobId, progress),
          ),
        ];
        if (!state.gitConfigured) return bindings;
        const requestHandler = new DirectorySyncRequestJobHandler(
          child("DirectorySyncRequestJobHandler"),
          host,
          () => state.requireDirectorySync(),
          () => state.requireGitSync(),
          state.gitReconciliation,
          operationStatus,
        );
        return [
          ...bindings,
          syncRequestJob.handle(({ input, jobId, progress }) =>
            requestHandler.process(input, jobId, progress),
          ),
        ];
      },

      // What other packages ask over the bus, entity activity that wakes the
      // exporter, and the startup signal that runs the initial sync. A worker
      // answers none of these; the scheduler owns the mirror's motion.
      subscriptions: ({
        config,
        state,
        workspaceUrl,
      }): readonly AnySubscriptionDefinition[] => {
        if (!state.isScheduler) return [];
        const { host, logger, operationStatus } = state;
        return [
          ...directorySyncSubscriptions({
            getDirectorySync: () => state.requireDirectorySync(),
            configure: (options) => state.configure(options),
            logger,
            gitConfig: config.git,
            getGitSync: () => state.gitSync,
            getManagementUrl: () => workspaceUrl("sync"),
          }),
          ...entityActivitySubscriptions(
            () => state.requireEntityExportDispatcher().wake(),
            logger,
            config.entityTypes,
          ),
          ...(config.initialSync
            ? [
                initialSyncSubscription(
                  host,
                  () => state.requireDirectorySync(),
                  config,
                  logger,
                  state.gitSync,
                  state.gitSync ? state.gitReconciliation : undefined,
                  initialSyncRecovery(state),
                  operationStatus,
                ),
              ]
            : []),
        ];
      },

      health: ({ config, state }) => ({
        "git-progress": () => state.operationStatus.getOperationalHealth(),
        // Two different questions. The first is what this role believes about
        // its own sync run; the second is what the checkout owner reports about
        // the work it is actually holding, which is the only place a wedged Git
        // child is visible at all. A fresh read-only connection: asking through
        // this role's own client would let a health request reattach, notice a
        // new owner, and schedule durable replay — writes from a read.
        ...(state.gitConfigured &&
        config.git &&
        state.host.gitBroker.socket !== undefined
          ? {
              "git-broker": createBrokerHealthCheck({
                probe: probeBrokerActivity(state.host.gitBroker.socket),
                now: (): number => Date.now(),
                progressTimeoutMs: resolveBrokerProgressTimeoutMs(),
              }),
            }
          : {}),
      }),

      tools: ({ state }) =>
        createDirectorySyncTools({
          directorySync: state.directorySyncFacade,
          host: state.host,
          gitSync: state.gitSync ? state.gitSyncFacade : undefined,
          operationStatus: state.operationStatus,
        }),

      // The sync workspace, declared for Studio to host: the provider owns
      // the data and the action, Studio owns the rendering.
      studioWorkspaces: (bindingContext) => {
        const provider = bindingContext.state.workspaceProvider;
        if (!provider) return [];
        return [
          directorySyncWorkspace.bind(bindingContext, {
            load: () => provider.getSnapshot(),
            actions: [
              syncNowAction.bind(bindingContext, ({ caller }) =>
                provider.syncNow(caller),
              ),
            ],
          }),
        ];
      },

      // Only the scheduler moves the mirror: seed validation, the exporter, the
      // watcher and the periodic pull start here, once the brain is up.
      ready: async ({ config, state }) => {
        if (!state.isScheduler) return;
        if (config.seedContent && config.strictSeedEntityTypes) {
          await validateSeedContentEntityTypes(
            config.syncPath ?? state.host.dataDir,
            state.host.mirror,
          );
        }
        await state.requireEntityExportDispatcher().start();
        await state.startBackgroundWork();
        state.readyState = true;
      },
    },
  );
}
