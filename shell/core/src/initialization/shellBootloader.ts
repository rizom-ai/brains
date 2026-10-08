import { PROJECTION_CHANNELS } from "@brains/contracts";
import { deferred } from "@brains/utils/deferred";
import {
  materializePrompts,
  pluginsRegisteredAnswerSchema,
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
import { z } from "@brains/utils/zod";
import {
  activateProjectionRuntime,
  type ProjectionRuntimeControls,
} from "../projection-runtime";
import { createConversationSourcePoller } from "../conversation-source-poller";
import {
  runtimeRoleProfile,
  type RuntimeProcessRole,
  type RuntimeRoleProfile,
} from "../runtime-process-role";

const INDEX_READINESS_POLL_INTERVAL_MS = 250;

const projectionBatchJobDataSchema = z.object({
  projectionBatch: z.object({
    rootJobId: z.string().min(1),
    childKey: z.string().min(1),
  }),
});

const conversationPollerStateSchema = z.object({
  cursor: z
    .object({
      updated: z.string().datetime(),
      id: z.string().min(1),
    })
    .nullable(),
});

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
  finalizeHttpRoutes(): void;
  startHttpHost(): Promise<void>;
  registerSystemJobHandlers(): void;
  registerSystemCapabilities(options: { resumeBackfill: boolean }): void;
  createProjectionInputContext(): ProjectionInputContext;
  createProjectionExecutionContext(): ProjectionExecutionContext;
  projectionRuntime?: ProjectionRuntimeControls | undefined;
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
  private readonly role: RuntimeRoleProfile;
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
    this.role = runtimeRoleProfile(processRole);
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
      ...(!this.role.serves && { executionOnly: true }),
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
    this.services.inboxFollowUpRegistry.finalize();
    await this.services.pluginManager.finalizePluginRegistrations();
    this.hooks.finalizeHttpRoutes();
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
      const projectionStore = this.services.entityService.getProjectionStore();
      const projectionRules =
        this.services.pluginManager.getProjectionRulesSnapshot();
      const hasConversationRule = projectionRules.some((rule) =>
        rule.sources.some((source) => source.kind === "conversation"),
      );
      const conversationPollerState = this.services.runtimeStateService.scoped({
        namespace: "projection.conversation-source",
        schema: conversationPollerStateSchema,
      });
      const pollConversationSources = hasConversationRule
        ? createConversationSourcePoller({
            conversations: this.services.conversationService,
            markDirty: (input) => projectionStore.markDirty(input),
            readState: () => conversationPollerState.get("live"),
            writeState: (state) => conversationPollerState.set("live", state),
            now: this.hooks.projectionRuntime?.now ?? Date.now,
          })
        : undefined;
      const projectionRuntime = await activateProjectionRuntime({
        store: projectionStore,
        queue: this.services.jobQueueService,
        setWakeup: (wakeup) =>
          this.services.entityService.setProjectionWakeup(wakeup),
        graph: this.services.pluginManager.getProjectionGraphSnapshot(),
        rules: projectionRules,
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
        now: this.hooks.projectionRuntime?.now ?? Date.now,
        ...(this.hooks.projectionRuntime?.scheduleWakeup && {
          scheduleWakeup: this.hooks.projectionRuntime.scheduleWakeup,
        }),
        ...(this.hooks.projectionRuntime?.onDiagnostic && {
          onDiagnostic: this.hooks.projectionRuntime.onDiagnostic,
        }),
        ...(this.hooks.projectionRuntime?.scheduleSweep && {
          scheduleSweep: this.hooks.projectionRuntime.scheduleSweep,
        }),
        ...(this.hooks.projectionRuntime?.sweepIntervalMs !== undefined && {
          sweepIntervalMs: this.hooks.projectionRuntime.sweepIntervalMs,
        }),
        ...(pollConversationSources && { pollConversationSources }),
        reconcileBatches: () =>
          this.services.entityService.recoverProjectionBatches(
            async (rootJobId) => {
              const jobs =
                await this.services.jobQueueService.getJobsByRootJobId(
                  rootJobId,
                );
              return jobs.flatMap((job) => {
                const parsed = projectionBatchJobDataSchema.safeParse(
                  JSON.parse(job.data),
                );
                if (
                  !parsed.success ||
                  parsed.data.projectionBatch.rootJobId !== rootJobId
                ) {
                  return [];
                }
                return [
                  {
                    jobId: job.id,
                    childKey: parsed.data.projectionBatch.childKey,
                    status: job.status,
                    terminalAt: job.completedAt,
                  },
                ];
              });
            },
          ),
        activationMode: this.role.projectionActivation,
      });
      this.services.disposables.push(() => projectionRuntime.dispose());
    }

    this.hooks.registerSystemJobHandlers();
    this.services.jobQueueService.finalizeHandlerRegistrations();

    this.hooks.registerCoreDataSources();
    if (this.role.serves) {
      this.hooks.registerSystemCapabilities({
        resumeBackfill: options?.mode === undefined,
      });
    }

    if (options?.mode === "register-only") {
      this.services.logger.debug("Shell boot complete (register-only mode)");
      return;
    }

    if (!this.role.serves) {
      // The worker imports startup content, so it never creates defaults:
      // it reads what exists and follows what its imports bring.
      await this.loadIdentityServices();
      this.services.jobProgressMonitor.start();
      await this.services.jobQueueWorker.start();
      this.services.logger.debug("Shell boot complete (worker process)");
      return;
    }

    // Settles once a pending initial import is in place; until then the
    // knowledge base stays gated, since an empty index reads as ready.
    let pendingStartupContent: Promise<void> | undefined;
    if (options?.mode !== "startup-check") {
      await this.hooks.startHttpHost();

      // A pluginsRegistered subscriber may queue the initial import for the
      // worker and answer that it is pending. Ready-state defaults then wait
      // for initialSyncCompleted: they must never be created before a content
      // repo's own identity and prompts are imported. Subscribed first, so a
      // completion sent while the answers are collected is not missed.
      const initialSync = deferred();
      this.services.disposables.push(
        this.services.messageBus.subscribe(
          SYSTEM_CHANNELS.initialSyncCompleted,
          async () => {
            initialSync.resolve();
            return { success: true };
          },
        ),
      );
      const initialSyncPending = await this.emitPluginsRegistered();

      const backfillResult =
        await this.services.entityService.backfillMissingEmbeddings();
      this.services.logger.debug("Queued missing embedding backfill jobs", {
        queued: backfillResult.queued,
        skipped: backfillResult.skipped,
      });
      // Existing membership becomes queryable before grouping reads are admitted.
      await this.services.entityService.reprojectRegisteredGroupings();

      if (initialSyncPending) {
        pendingStartupContent = initialSync.promise;
      } else {
        await this.settleStartupContent();
      }
    } else {
      await this.prepareReadyState();
    }

    await this.services.pluginManager.readyPlugins();

    if (options?.mode === "startup-check") {
      this.services.logger.debug("Shell boot complete (startup-check mode)");
      return;
    }

    await this.startRuntimeServices();
    if (pendingStartupContent) {
      const startupContent = pendingStartupContent;
      // The continuation belongs to this shell, not an unowned Promise chain.
      // Closing the scope must not let a late import/default write announce
      // readiness or start another monitor on an already closed runtime.
      await this.lifecycle.fork(
        Effect.tryPromise({
          try: async (signal) => {
            await startupContent;
            signal.throwIfAborted();
            await this.settleStartupContent(signal);
          },
          catch: (error) => error,
        }).pipe(
          Effect.flatMap(() => this.runIndexReadinessMonitor()),
          Effect.catchAll((error) =>
            Effect.sync(() => {
              this.services.logger.error(
                "Failed to settle startup content",
                error,
              );
            }),
          ),
        ),
      );
    } else {
      await this.startIndexReadinessMonitor();
    }

    this.services.logger.debug("Shell boot complete");
  }

  /** Emit pluginsRegistered; true when a subscriber's initial sync is pending. */
  private async emitPluginsRegistered(): Promise<boolean> {
    const responses = await this.services.messageBus.collect({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {
        timestamp: new Date().toISOString(),
        pluginCount: this.services.pluginManager.getAllPluginIds().length,
      },
      sender: "shell",
    });
    this.services.logger.debug("Emitted plugins registered event");
    return responses.some(
      (response) =>
        "data" in response &&
        pluginsRegisteredAnswerSchema.safeParse(response.data).data
          ?.initialSyncPending === true,
    );
  }

  /** Create ready-state defaults, then announce that startup content settled. */
  private async settleStartupContent(signal?: AbortSignal): Promise<void> {
    await this.prepareReadyState(signal);
    signal?.throwIfAborted();
    await this.services.messageBus.send({
      type: SYSTEM_CHANNELS.startupContentSettled,
      payload: { timestamp: new Date().toISOString() },
      sender: "shell",
      broadcast: true,
    });
    this.services.logger.debug("Emitted startup content settled event");
  }

  private async loadIdentityServices(): Promise<void> {
    await runConcurrentPhase([
      (): Promise<void> => this.services.identityService.refreshCache(),
      (): Promise<void> => this.services.profileService.refreshCache(),
      (): Promise<void> =>
        this.services.canonicalIdentityService.refreshCache(),
    ]);
    this.services.logger.debug("Identity services loaded");
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

  private async prepareReadyState(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.initializeIdentityServices();
    signal?.throwIfAborted();

    const count = await materializePrompts(
      this.services.templateRegistry,
      this.services.entityService,
    );
    if (count > 0) {
      this.services.logger.debug(`Materialized ${count} prompt entities`);
    }
  }

  private async startRuntimeServices(): Promise<void> {
    for (const name of ["shell:recurring-checks", "shell:guest-retention"]) {
      if (this.services.daemonRegistry.has(name)) {
        await this.services.daemonRegistry.start(name);
      }
    }
    await this.services.pluginManager.startPluginDaemons();
    if (this.role.executes) {
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
