import { PROJECTION_CHANNELS } from "@brains/contracts";
import {
  materializePrompts,
  SYSTEM_CHANNELS,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "@brains/plugins";
import type { ShellConfig } from "../config";
import type { ShellInitializer } from "./shellInitializer";
import type { ShellServices } from "../types/shell-types";
import type { ShellLifecycle } from "./shell-lifecycle";
import { runConcurrentPhase } from "../effect-runtime";
import { Effect } from "@brains/utils/effect";
import { createId } from "@brains/utils/id";
import { activateProjectionRuntime } from "../projection-runtime";
import type { RuntimeProcessRole } from "../runtime-process-role";

const INDEX_READINESS_POLL_INTERVAL_MS = 250;

/**
 * Boot mode variants. Mutually exclusive — encoded as a single field so callers
 * can't accidentally combine them.
 *
 * - `register-only`: load plugins and register capabilities, then return.
 *   No ready hooks, no daemons, no jobs. Used by `brain operate` for command
 *   discovery.
 * - `startup-check`: run registration and ready hooks, then return without
 *   starting daemons or job workers. Used by external-package smoke tests to
 *   verify plugin loading without side effects (and without requiring an AI
 *   API key).
 */
export type BootMode = "register-only" | "startup-check";

export interface ShellBootloaderOptions {
  mode?: BootMode;
}

export interface ShellBootloaderHooks {
  registerCoreDataSources(): void;
  registerSystemCapabilities(): void;
  createProjectionInputContext(): ProjectionInputContext;
  createProjectionExecutionContext(): ProjectionExecutionContext;
}

/**
 * Coordinates shell startup phases.
 *
 * Shell remains the runtime facade; this class owns boot ordering so plugin
 * lifecycle semantics are explicit and testable.
 */
export class ShellBootloader {
  private readonly config: ShellConfig;
  private readonly services: ShellServices;
  private readonly lifecycle: ShellLifecycle;
  private readonly initializer: ShellInitializer;
  private readonly processRole: RuntimeProcessRole | undefined;
  private readonly hooks: ShellBootloaderHooks;
  constructor(
    config: ShellConfig,
    services: ShellServices,
    lifecycle: ShellLifecycle,
    initializer: ShellInitializer,
    processRole: RuntimeProcessRole | undefined,
    hooks: ShellBootloaderHooks,
  ) {
    this.config = config;
    this.services = services;
    this.lifecycle = lifecycle;
    this.initializer = initializer;
    this.processRole = processRole;
    this.hooks = hooks;
  }

  public async boot(options?: ShellBootloaderOptions): Promise<void> {
    this.services.logger.debug("Starting Shell boot");

    const shellInitializer = this.initializer;

    // Settle database readiness (WAL mode, migrations, indexes, ATTACH)
    // before plugins load or runtime services can use the connections.
    await runConcurrentPhase([
      (): Promise<void> => this.services.entityService.initialize(),
      (): Promise<void> =>
        this.services.jobQueueService.initialize?.() ?? Promise.resolve(),
      (): Promise<void> => this.services.runtimeStateService.initialize(),
      (): Promise<void> =>
        this.services.conversationService.initialize?.() ?? Promise.resolve(),
    ]);

    const registrationContext = {
      ...(this.config.entityDisplay !== undefined && {
        entityDisplay: this.config.entityDisplay,
      }),
      ...(this.processRole === "worker" && { executionOnly: true }),
    };
    await shellInitializer.initializeAll(
      this.services.templateRegistry,
      this.services.entityRegistry,
      this.services.pluginManager,
      {
        ...(options?.mode === "register-only" && { registerOnly: true }),
        ...(Object.keys(registrationContext).length > 0 && {
          registrationContext,
        }),
      },
    );

    // Freeze composition before imported content can be parsed or validated.
    this.services.profileKindRegistry.finalize();
    this.services.channelRegistry.finalize();
    this.services.inboxRegistry.finalize();
    await this.services.pluginManager.finalizePluginRegistrations();
    await this.services.projectionRuntimeSupervisor.initialize(
      this.services.pluginManager.getProjectionGraphSnapshot(),
    );

    // Register job handlers for content operations before any ready signals.
    shellInitializer.registerJobHandlers(
      this.services.jobQueueService,
      this.services.contentService,
      this.services.entityService,
    );

    if (options?.mode === undefined) {
      const projectionRuntime = await activateProjectionRuntime({
        store: this.services.entityService.getProjectionStore(),
        queue: this.services.jobQueueService,
        setWakeup: (wakeup) =>
          this.services.entityService.setProjectionWakeup(wakeup),
        graph: this.services.pluginManager.getProjectionGraphSnapshot(),
        rules: this.services.pluginManager.getProjectionRulesSnapshot(),
        inputContext: this.hooks.createProjectionInputContext(),
        executionContext: this.hooks.createProjectionExecutionContext(),
        reconcileTargets: (targets) =>
          this.services.entityService.reconcileProjectionTargets(targets),
        beforeWaveCompletion: async (summary): Promise<void> => {
          if (
            !this.services.messageBus.hasHandlers(PROJECTION_CHANNELS.waveReady)
          ) {
            return;
          }
          const responses = await this.services.messageBus.collect({
            type: PROJECTION_CHANNELS.waveReady,
            payload: summary,
            sender: "shell",
          });
          if (
            responses.length === 0 ||
            responses.some(
              (response) => "noop" in response || !response.success,
            )
          ) {
            throw new Error(
              `Projection wave ${summary.waveId} completion was not acknowledged`,
            );
          }
        },
        logger: this.services.logger,
        createWaveId: createId,
        now: Date.now,
        activationMode:
          this.processRole === "worker" ? "executor" : "scheduler",
      });
      this.services.disposables.push(() => projectionRuntime.dispose());
    }

    this.services.jobQueueService.finalizeHandlerRegistrations();

    this.hooks.registerCoreDataSources();
    if (this.processRole !== "worker") {
      this.hooks.registerSystemCapabilities();
    }

    if (options?.mode === "register-only") {
      this.services.logger.debug("Shell boot complete (register-only mode)");
      return;
    }

    if (this.processRole === "worker") {
      await this.initializeIdentityServices();
      this.services.jobProgressMonitor.start();
      await this.services.jobQueueWorker.start();
      this.services.logger.debug("Shell boot complete (worker process)");
      return;
    }

    if (options?.mode !== "startup-check") {
      await this.startEarlyWebserver();

      // Run initial sync (driven by pluginsRegistered subscribers) before
      // materializing ready-state defaults. Singleton defaults must not be
      // created while a directory import may still populate existing markdown
      // from brain-data into the entity DB.
      await this.emitPluginsRegistered();

      const backfillResult =
        await this.services.entityService.backfillMissingEmbeddings();
      this.services.logger.debug("Queued missing embedding backfill jobs", {
        queued: backfillResult.queued,
        skipped: backfillResult.skipped,
      });
    }

    await this.prepareReadyState();

    await this.services.pluginManager.readyPlugins();

    if (options?.mode === "startup-check") {
      this.services.logger.debug("Shell boot complete (startup-check mode)");
      return;
    }

    await this.startRuntimeServices();
    await this.startIndexReadinessMonitor();

    this.services.logger.debug("Shell boot complete");
  }

  private async startEarlyWebserver(): Promise<void> {
    const webserverDaemonName = "webserver:webserver";
    if (!this.services.daemonRegistry.has(webserverDaemonName)) return;

    await this.services.daemonRegistry.start(webserverDaemonName);
    this.services.logger.debug("Started webserver before initial sync");
  }

  private async emitPluginsRegistered(): Promise<void> {
    await this.services.messageBus.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {
        timestamp: new Date().toISOString(),
        pluginCount: this.services.pluginManager.getAllPluginIds().length,
      },
      sender: "shell",
      broadcast: true,
    });
    this.services.logger.debug("Emitted plugins registered event");
  }

  private async initializeIdentityServices(): Promise<void> {
    await runConcurrentPhase([
      (): Promise<void> => this.services.identityService.initialize(),
      (): Promise<void> => this.services.profileService.initialize(),
      (): Promise<void> =>
        this.services.canonicalIdentityService.refreshCache(),
    ]);
    this.services.logger.debug("Identity services initialized");
  }

  private async prepareReadyState(): Promise<void> {
    await this.initializeIdentityServices();

    const count = await materializePrompts(
      this.services.templateRegistry,
      this.services.entityService,
    );
    if (count > 0) {
      this.services.logger.debug(`Materialized ${count} prompt entities`);
    }
  }

  private async startRuntimeServices(): Promise<void> {
    const recurringDaemonName = "shell:recurring-checks";
    if (this.services.daemonRegistry.has(recurringDaemonName)) {
      await this.services.daemonRegistry.start(recurringDaemonName);
    }
    await this.services.pluginManager.startPluginDaemons();
    if (this.processRole !== "web") {
      await this.services.jobQueueWorker.start();
    }
    this.services.jobProgressMonitor.start();
    await this.services.batchJobManager.start();
  }

  private async startIndexReadinessMonitor(): Promise<void> {
    await this.lifecycle.fork(this.runIndexReadinessMonitor());
  }

  private runIndexReadinessMonitor(): Effect.Effect<void> {
    const { entityService, logger } = this.services;

    return Effect.tryPromise({
      try: (signal) =>
        entityService.awaitIndexReady({
          intervalMs: INDEX_READINESS_POLL_INTERVAL_MS,
          signal,
        }),
      catch: (error) => error,
    }).pipe(
      Effect.tap((status) =>
        Effect.sync(() => {
          if (status.degraded) {
            logger.warn(
              "Semantic index ready with degraded embeddings",
              status,
            );
          } else {
            logger.debug("Semantic index ready", status);
          }
        }),
      ),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          logger.warn("Semantic index readiness monitor stopped", error);
        }),
      ),
    );
  }
}
