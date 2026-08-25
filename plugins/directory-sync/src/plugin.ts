import type {
  IEntityService,
  Plugin,
  ServicePluginContext,
  Tool,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
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
import type { IGitSync } from "./types";
import {
  directorySyncConfigSchema,
  type DirectorySyncConfig,
  type DirectorySyncConfigInput,
} from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import { DirectorySyncRequestJobHandler } from "./handlers";
import { registerDirectorySyncJobHandlers } from "./lib/register-job-handlers";
import { setupAutoSync, setupFileWatcher } from "./lib/auto-sync";
import { setupInitialSync } from "./lib/initial-sync";
import { validateSeedContentEntityTypes } from "./lib/file-discovery";
import { setupPeriodicGitSync } from "./lib/git-periodic-sync";
import { DurableEntityExportDispatcher } from "./lib/durable-entity-export-dispatcher";
import { bootstrapContentRemoteFromSeed } from "./lib/content-remote-bootstrap";
import { registerMessageHandlers } from "./lib/message-handlers";
import { createDirectorySyncTools } from "./tools";
import { DirectorySyncOperationStatusService } from "./lib/directory-sync-operation-status";
import { GitReconciliationService } from "./lib/git-reconciliation";
import { PendingDeleteRegistry } from "./lib/pending-delete-registry";
import { DirectorySyncWorkspaceProvider } from "./lib/cms-workspace";
import {
  DirectorySyncRuntime,
  type DirectorySyncScheduler,
} from "./lib/directory-sync-runtime";
import {
  createDirectorySyncFacade,
  createGitSyncFacade,
} from "./lib/active-sync-facades";
import "./types/job-augmentation";
import packageJson from "../package.json";
import { getErrorMessage } from "@brains/utils/error";

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

export class DirectorySyncPlugin extends ServicePlugin<
  DirectorySyncConfig,
  DirectorySyncConfigInput
> {
  private directorySync: DirectorySync | undefined;
  private gitSync: IGitSync | undefined;
  /**
   * The same client as `gitSync`, kept for the two questions only the
   * broker protocol can answer: whether it is admitting mutations, and
   * being told that this role has reconciled.
   */
  private operationStatus: DirectorySyncOperationStatusService | undefined;
  private gitReconciliation: GitReconciliationService | undefined;
  private workspaceProvider: DirectorySyncWorkspaceProvider | undefined;
  private cmsWorkspaceUrl: string | undefined;
  private runtime = new DirectorySyncRuntime();
  private readonly directorySyncFacade = createDirectorySyncFacade(() =>
    this.requireDirectorySync(),
  );
  private readonly gitSyncFacade = createGitSyncFacade(() =>
    this.requireGitSync(),
  );
  private readonly runtimeScheduler: DirectorySyncScheduler = {
    scheduleTrailing: (key, delayMs, operation): void => {
      this.runtime.scheduleTrailing(key, delayMs, operation);
    },
  };
  private watcherOwned = false;
  private gitBackgroundStarted = false;
  private entityExportDispatcher: DurableEntityExportDispatcher | undefined;
  private readyState = false;
  private shutdownStarted = false;
  private configurationQueue: Promise<void> = Promise.resolve();
  private readonly pendingDeletes = new PendingDeleteRegistry();

  constructor(config: DirectorySyncConfigInput = {}) {
    super("directory-sync", packageJson, config, directorySyncConfigSchema);
  }

  private requireDirectorySync(): DirectorySync {
    if (!this.directorySync) {
      throw new Error("DirectorySync service not initialized");
    }
    return this.directorySync;
  }

  private requireGitSync(): IGitSync {
    if (!this.gitSync) {
      throw new Error("GitSync service not initialized");
    }
    return this.gitSync;
  }

  private requireEntityExportDispatcher(): DurableEntityExportDispatcher {
    if (!this.entityExportDispatcher) {
      throw new Error("Durable entity-export dispatcher is unavailable");
    }
    return this.entityExportDispatcher;
  }

  private createEntityExportDispatcher(
    context: ServicePluginContext,
    runtime: DirectorySyncRuntime,
    directorySync: DirectorySync,
    gitSync: IGitSync | undefined,
  ): DurableEntityExportDispatcher {
    return new DurableEntityExportDispatcher({
      runtime,
      directorySync,
      entityService: context.entityService,
      gitSync,
      ...(gitSync
        ? {
            saveCheckpoint: (checkpoint) =>
              this.requireGitReconciliation().saveCheckpoint(checkpoint),
          }
        : {}),
      operationStatus: this.operationStatus,
      logger: this.logger.child("EntityExportDispatcher"),
      debounceMs: this.config.commitDebounce,
    });
  }

  private bindCleanupAdmission(
    context: ServicePluginContext,
    directorySync: DirectorySync,
    dispatcher?: DurableEntityExportDispatcher,
  ): void {
    if (dispatcher) {
      directorySync.setCleanupAdmission(() => dispatcher.settleBeforeCleanup());
      return;
    }
    directorySync.setCleanupAdmission(async () => {
      if (await context.entityService.hasPendingEntityExports()) {
        throw new Error(
          "Directory cleanup blocked by pending durable entity exports",
        );
      }
    });
  }

  private requireOperationStatus(): DirectorySyncOperationStatusService {
    if (!this.operationStatus) {
      throw new Error("Directory sync operation status not initialized");
    }
    return this.operationStatus;
  }

  private requireGitReconciliation(): GitReconciliationService {
    if (!this.gitReconciliation) {
      throw new Error("Git reconciliation service not initialized");
    }
    return this.gitReconciliation;
  }

  /** Whether git integration has a configured repository. */
  public hasGitSync(): boolean {
    return this.gitSync !== undefined;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.templates.register({
      status: {
        name: "status",
        description: "Directory synchronization status",
        schema: directorySyncStatusSchema,
        basePrompt: "",
        formatter: new DirectorySyncStatusFormatter(),
        requiredPermission: "admin",
      },
    });

    const syncPath = resolveRuntimeSyncPath({
      configuredSyncPath: this.config.syncPath,
      dataDir: context.dataDir,
      gitConfigured: this.isGitConfigured(),
      gitBrokerCheckout: context.gitBrokerCheckout,
    });
    this.directorySync = this.createDirectorySync(context, syncPath);
    try {
      await this.directorySync.initializeDirectory();
      this.logger.debug("Directory structure initialized", { path: syncPath });
    } catch (error) {
      this.logger.error("Failed to initialize directory", error);
      throw error;
    }

    this.operationStatus = new DirectorySyncOperationStatusService(
      context.runtimeState,
      context.jobs,
      this.logger.child("OperationStatus"),
      syncPath,
    );
    const interruptedPull = await this.operationStatus.initialize();
    if (!context.executionOnly) {
      context.operationalHealth.register("git-progress", () =>
        this.requireOperationStatus().getOperationalHealth(),
      );
      // Two different questions. The first is what this role believes about
      // its own sync run; the second is what the checkout owner reports
      // about the work it is actually holding, which is the only place a
      // wedged Git child is visible at all.
      const socketPath = context.gitBrokerSocket;
      if (this.isGitConfigured() && socketPath !== undefined) {
        context.operationalHealth.register(
          "git-broker",
          createBrokerHealthCheck({
            // A fresh read-only connection. Asking through this role's own
            // client would let a health request reattach, notice a new
            // owner, and schedule durable replay — writes from a read.
            probe: probeBrokerActivity(socketPath),
            now: (): number => Date.now(),
            progressTimeoutMs: resolveBrokerProgressTimeoutMs(),
          }),
        );
      }
    }
    this.gitReconciliation = new GitReconciliationService(context.runtimeState);

    if (!context.executionOnly && this.config.autoSync) {
      setupFileWatcher(
        context,
        this.directorySync,
        syncPath,
        this.operationStatus,
      );
    }

    await this.registerJobHandlers(context);

    if (this.config.git && !this.isGitConfigured()) {
      this.logger.debug(
        "Git block present but no repo/gitUrl configured — git sync disabled",
      );
    }

    if (this.isGitConfigured()) {
      let connectedGitSync: BrokerGitSync;
      try {
        if (!context.executionOnly) await this.bootstrapContentRemote();
        connectedGitSync = await this.connectToGitBroker(
          syncPath,
          this.requireDirectorySync(),
        );
        this.gitSync = connectedGitSync;
      } catch (error) {
        if (!context.executionOnly && interruptedPull) {
          await this.operationStatus.finishInterruptedPull(interruptedPull.id, {
            recovered: false,
            message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
          });
        }
        throw error;
      }
      // A replacement owner holds mutations until someone has accounted
      // for what the lost generation left. Only a scheduling role can do
      // that — the queue and the checkpoint live here — and only one of
      // them should, so the worker never opens admission.
      if (!context.executionOnly) {
        await this.reconcileInheritedWork(
          context,
          connectedGitSync,
          this.requireDirectorySync(),
        );
      }
      // `initialize` can clone, checkout, and configure the repository. It is
      // intentionally after inherited-work replay: a replacement starts with
      // mutation admission closed, so doing this first would prevent the role
      // from ever reaching the reconciliation that opens it.
      await connectedGitSync.initialize();
      this.logger.info("Git integration enabled", {
        repo: this.config.git?.repo,
      });

      context.jobs.registerHandler(
        "sync-request",
        new DirectorySyncRequestJobHandler(
          this.logger.child("DirectorySyncRequestJobHandler"),
          context,
          () => this.requireDirectorySync(),
          () => this.requireGitSync(),
          this.requireGitReconciliation(),
          this.operationStatus,
        ),
      );
      if (!context.executionOnly && !this.config.initialSync) {
        try {
          if (interruptedPull) {
            await this.operationStatus.markProgress(interruptedPull.id);
          }
          await this.requireGitReconciliation().replayAndQueue({
            gitSync: this.gitSync,
            directorySync: this.requireDirectorySync(),
            context,
            source: "startup-replay",
          });
          if (interruptedPull) {
            await this.operationStatus.finishInterruptedPull(
              interruptedPull.id,
              {
                recovered: true,
                message: "Recovered interrupted Git handoff during startup",
              },
            );
          }
        } catch (error) {
          if (interruptedPull) {
            await this.operationStatus.finishInterruptedPull(
              interruptedPull.id,
              {
                recovered: false,
                message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
              },
            );
          }
          throw error;
        }
      }
    } else if (!context.executionOnly && interruptedPull) {
      await this.operationStatus.finishInterruptedPull(interruptedPull.id, {
        recovered: false,
        message:
          "Interrupted Git handoff recovery requires a configured repository",
      });
    }

    if (!context.executionOnly) {
      const dispatcher = this.createEntityExportDispatcher(
        context,
        this.runtime,
        this.requireDirectorySync(),
        this.gitSync,
      );
      this.entityExportDispatcher = dispatcher;
      this.bindCleanupAdmission(
        context,
        this.requireDirectorySync(),
        dispatcher,
      );
      setupAutoSync(
        context,
        () => this.requireEntityExportDispatcher().wake(),
        this.logger,
        this.config.entityTypes,
        this.operationStatus,
      );
    } else {
      this.bindCleanupAdmission(context, this.requireDirectorySync());
    }

    if (!context.executionOnly && this.config.initialSync) {
      setupInitialSync(
        context,
        () => this.requireDirectorySync(),
        this.config,
        this.logger,
        this.gitSync ? this.gitSyncFacade : undefined,
        this.gitSync ? this.requireGitReconciliation() : undefined,
        interruptedPull && this.gitSync
          ? {
              onGitProgress:
                this.requireOperationStatus().createProgressObserver(
                  interruptedPull.id,
                ),
              onGitRecoverySucceeded: (): Promise<void> =>
                this.requireOperationStatus().finishInterruptedPull(
                  interruptedPull.id,
                  {
                    recovered: true,
                    message:
                      "Recovered interrupted Git handoff during initial sync",
                  },
                ),
              onGitRecoveryFailed: (error): Promise<void> =>
                this.requireOperationStatus().finishInterruptedPull(
                  interruptedPull.id,
                  {
                    recovered: false,
                    message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
                  },
                ),
            }
          : undefined,
        this.operationStatus,
      );
    }

    if (!context.executionOnly) {
      this.workspaceProvider = new DirectorySyncWorkspaceProvider({
        context,
        config: this.config,
        getDirectorySync: (): DirectorySync => this.requireDirectorySync(),
        getGitSync: (): IGitSync | undefined => this.gitSync,
        operationStatus: this.operationStatus,
      });

      registerMessageHandlers(
        context,
        () => this.requireDirectorySync(),
        (options) => this.configure(options),
        this.logger,
        this.config.git,
        () => this.gitSync,
        () => this.cmsWorkspaceUrl,
      );
    }
  }

  protected override async onReady(): Promise<void> {
    if (this.config.seedContent && this.config.strictSeedEntityTypes) {
      const context = this.getContext();
      await validateSeedContentEntityTypes(
        this.config.syncPath ?? context.dataDir,
        context.entityService,
      );
    }
    await this.requireEntityExportDispatcher().start();
    await this.startBackgroundWork();
    this.readyState = true;
    this.cmsWorkspaceUrl = await this.workspaceProvider?.registerCmsWorkspace();
  }

  protected override async getTools(): Promise<Tool[]> {
    return createDirectorySyncTools(
      this.directorySyncFacade,
      this.getContext(),
      this.id,
      this.gitSync ? this.gitSyncFacade : undefined,
      this.operationStatus,
    );
  }

  protected override async onShutdown(): Promise<void> {
    this.shutdownStarted = true;
    await this.workspaceProvider?.unregisterCmsWorkspace();
    await this.configurationQueue;
    await this.stopGeneration(this.runtime, this.directorySync, this.gitSync);

    this.readyState = false;
    this.watcherOwned = false;
    this.gitBackgroundStarted = false;
    this.entityExportDispatcher = undefined;
  }

  public getDirectorySync(): DirectorySync | undefined {
    return this.directorySync;
  }

  public configure(options: { syncPath: string }): Promise<void> {
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

    const context = this.getContext();
    const candidateRuntime = new DirectorySyncRuntime();
    const candidateDirectorySync = this.createDirectorySync(context, syncPath);
    let candidateGitSync: BrokerGitSync | undefined;
    let candidateDispatcher: DurableEntityExportDispatcher | undefined;

    try {
      await candidateDirectorySync.initializeDirectory();
      if (this.config.autoSync) {
        setupFileWatcher(
          context,
          candidateDirectorySync,
          syncPath,
          this.operationStatus,
        );
      }
      if (this.isGitConfigured()) {
        candidateGitSync = await this.connectToGitBroker(
          syncPath,
          candidateDirectorySync,
        );
        await this.reconcileInheritedWork(
          context,
          candidateGitSync,
          candidateDirectorySync,
        );
        await candidateGitSync.initialize();
      }
      candidateDispatcher = this.createEntityExportDispatcher(
        context,
        candidateRuntime,
        candidateDirectorySync,
        candidateGitSync,
      );
      this.bindCleanupAdmission(
        context,
        candidateDirectorySync,
        candidateDispatcher,
      );
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
    this.operationStatus?.setSyncPath(syncPath);
    this.watcherOwned = false;
    this.gitBackgroundStarted = false;

    if (candidateGitSync) {
      await this.requireGitReconciliation().replayAndQueue({
        gitSync: candidateGitSync,
        directorySync: candidateDirectorySync,
        context,
        source: "reconfigure-replay",
      });
    }
    if (this.readyState) {
      await this.requireEntityExportDispatcher().start();
      await this.startBackgroundWork();
    }
    this.logger.info("Directory sync reconfigured", { path: syncPath });
  }

  private createDirectorySync(
    context: ServicePluginContext,
    syncPath: string,
  ): DirectorySync {
    const directorySync = new DirectorySync(
      {
        syncPath,
        autoSync: this.config.autoSync,
        watchInterval: this.config.watchInterval,
        includeMetadata: this.config.includeMetadata,
        entityTypes: this.config.entityTypes,
        deleteOnFileRemoval: this.config.deleteOnFileRemoval,
        maxImportFileBytes: this.config.maxImportFileBytes,
        entityService: context.entityService as IEntityService,
        logger: context.logger,
      },
      this.pendingDeletes,
    );
    return directorySync;
  }

  private isGitConfigured(): boolean {
    return (
      this.config.git !== undefined &&
      (this.config.git.repo !== undefined ||
        this.config.git.gitUrl !== undefined)
    );
  }

  private async bootstrapContentRemote(): Promise<void> {
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
   * Reach the checkout's owner. This role executes no Git itself, and there is
   * no in-process path to fall back to: a missing socket fails registration
   * rather than quietly making this process a second owner.
   *
   * The token stays in this role's configuration and never reaches the broker;
   * the broker resolves its own authenticated remote from the same brain.yaml.
   */
  private async connectToGitBroker(
    syncPath: string,
    directorySync: DirectorySync,
  ): Promise<BrokerGitSync> {
    const git = this.config.git;
    if (!git) throw new Error("Git configuration is unavailable");

    const attached: { gitSync?: BrokerGitSync } = {};
    const replacementRecovery = this.getContext().executionOnly
      ? undefined
      : createOwnerReplacementHandler({
          logger: this.logger.child("GitOwner"),
          scheduler: this.runtimeScheduler,
          replay: createOwnerRecoveryReplay({
            client: (): BrokerGitSync | undefined => attached.gitSync,
            replay: async (client): Promise<void> => {
              await this.requireGitReconciliation().replayAndQueue({
                gitSync: client,
                directorySync,
                context: this.getContext(),
                source: "broker-replacement-replay",
              });
            },
          }),
        });

    const gitSync = await connectGitSync({
      socketPath: this.getContext().gitBrokerSocket,
      checkoutPath: syncPath,
      branch: git.branch,
      remoteUrl: resolveGitRemoteUrl({
        logger: this.logger,
        dataDir: syncPath,
        repo: git.repo,
        gitUrl: git.gitUrl,
      }),
      logger: this.logger.child("GitSync"),
      // Only a scheduling role reconciles. Connection loss schedules the
      // work immediately; waiting for a later Git call could leave a quiet
      // checkout closed forever after replacement.
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
   * operation never landed. Only reads are needed for that, which is why
   * the broker keeps them open while it holds mutations.
   */
  private async reconcileInheritedWork(
    context: ServicePluginContext,
    gitSync: BrokerGitSync,
    directorySync: DirectorySync,
  ): Promise<void> {
    if (await gitSync.admitsMutations()) return;

    this.logger.warn(
      "Git owner is holding mutations; reconciling inherited work",
    );
    await this.requireGitReconciliation().replayAndQueue({
      gitSync,
      directorySync,
      context,
      source: "inherited-work-replay",
    });
    await gitSync.openAdmission();
  }

  private async startBackgroundWork(): Promise<void> {
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

    const context = this.getContext();
    if (this.config.autoSync) {
      setupPeriodicGitSync(
        gitSync,
        directorySync,
        context,
        this.config.syncInterval,
        this.logger.child("GitPeriodicSync"),
        this.runtime,
        this.requireGitReconciliation(),
        this.operationStatus,
      );
    }
    this.gitBackgroundStarted = true;
  }

  private async stopGeneration(
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

  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    registerDirectorySyncJobHandlers(
      context,
      this.directorySyncFacade,
      this.logger,
      () => this.requireDirectorySync(),
      this.requireOperationStatus(),
    );
  }
}

export function directorySync(config: DirectorySyncConfigInput = {}): Plugin {
  return new DirectorySyncPlugin(config);
}

export const directorySyncPlugin: typeof directorySync = directorySync;
