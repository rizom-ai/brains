import type { Plugin, ServicePluginContext, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { DirectorySync } from "./lib/directory-sync";
import { connectGitSync } from "./lib/broker/connect";
import {
  BROKER_PROGRESS_TIMEOUT_MS,
  createBrokerHealthCheck,
} from "./lib/broker/health";
import type { BrokerGitSync } from "./lib/broker/git-sync-client";
import { resolveGitRemoteUrl } from "./lib/git-options";
import { createOwnerReplacementHandler } from "./lib/git-owner-replacement";
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
import { setupGitAutoCommit } from "./lib/git-auto-commit";
import { setupPeriodicGitSync } from "./lib/git-periodic-sync";
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

export class DirectorySyncPlugin extends ServicePlugin<
  DirectorySyncConfig,
  DirectorySyncConfigInput
> {
  private directorySync: DirectorySync | undefined;
  private gitSync: IGitSync | undefined;
  /** The same client as `gitSync`, kept for questions only it can answer. */
  private brokerClient: BrokerGitSync | undefined;
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
  private gitAutoCommitRegistered = false;
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

  private requireBrokerClient(): BrokerGitSync {
    if (!this.brokerClient) {
      throw new Error("No Git checkout owner has been connected yet");
    }
    return this.brokerClient;
  }

  private requireGitSync(): IGitSync {
    if (!this.gitSync) {
      throw new Error("GitSync service not initialized");
    }
    return this.gitSync;
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

    const syncPath = this.config.syncPath ?? context.dataDir;
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
      if (this.isGitConfigured()) {
        context.operationalHealth.register(
          "git-broker",
          createBrokerHealthCheck({
            probe: () => this.requireBrokerClient().activity(),
            now: (): number => Date.now(),
            progressTimeoutMs: BROKER_PROGRESS_TIMEOUT_MS,
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

    // Entity subscriptions remain web-owned; workers construct only handlers.
    if (!context.executionOnly) {
      setupAutoSync(
        context,
        () => this.requireDirectorySync(),
        this.logger,
        this.config.entityTypes,
        this.operationStatus,
      );
    }

    if (this.config.git && !this.isGitConfigured()) {
      this.logger.debug(
        "Git block present but no repo/gitUrl configured — git sync disabled",
      );
    }

    if (this.isGitConfigured()) {
      try {
        if (!context.executionOnly) await this.bootstrapContentRemote();
        this.gitSync = await this.initializeGitSync(syncPath);
      } catch (error) {
        if (!context.executionOnly && interruptedPull) {
          await this.operationStatus.finishInterruptedPull(interruptedPull.id, {
            recovered: false,
            message: `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
          });
        }
        throw error;
      }
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
      );
    }

    if (!context.executionOnly) {
      this.workspaceProvider = new DirectorySyncWorkspaceProvider({
        context,
        pluginId: this.id,
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
    await this.configurationQueue;
    await this.stopGeneration(this.runtime, this.directorySync, this.gitSync);

    this.readyState = false;
    this.watcherOwned = false;
    this.gitBackgroundStarted = false;
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
    let candidateGitSync: IGitSync | undefined;

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
        candidateGitSync = await this.initializeGitSync(syncPath);
      }
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
      await this.startBackgroundWork();
    }
    this.logger.info("Directory sync reconfigured", { path: syncPath });
  }

  private createDirectorySync(
    context: ServicePluginContext,
    syncPath: string,
  ): DirectorySync {
    return new DirectorySync(
      {
        syncPath,
        autoSync: this.config.autoSync,
        watchInterval: this.config.watchInterval,
        includeMetadata: this.config.includeMetadata,
        entityTypes: this.config.entityTypes,
        deleteOnFileRemoval: this.config.deleteOnFileRemoval,
        maxImportFileBytes: this.config.maxImportFileBytes,
        entityService: context.entityService,
        logger: context.logger,
      },
      this.pendingDeletes,
    );
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
  private async initializeGitSync(syncPath: string): Promise<IGitSync> {
    const git = this.config.git;
    if (!git) throw new Error("Git configuration is unavailable");

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
      onOwnerReplaced: createOwnerReplacementHandler({
        logger: this.logger.child("GitOwner"),
        scheduler: this.runtimeScheduler,
        replay: () =>
          this.requireGitReconciliation().replayAndQueue({
            gitSync: this.requireGitSync(),
            directorySync: this.requireDirectorySync(),
            context: this.getContext(),
            source: "broker-replacement-replay",
          }),
      }),
    });
    await gitSync.initialize();
    this.brokerClient = gitSync;
    this.logger.info("Git integration enabled", { repo: git.repo });
    return gitSync;
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
    if (!this.gitAutoCommitRegistered) {
      setupGitAutoCommit(
        context.messaging,
        () => this.requireGitSync(),
        this.config.commitDebounce,
        this.logger.child("GitAutoCommit"),
        this.runtimeScheduler,
        this.requireGitReconciliation(),
        this.operationStatus,
      );
      this.gitAutoCommitRegistered = true;
    }

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
