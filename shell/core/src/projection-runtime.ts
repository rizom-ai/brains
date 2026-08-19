import type { ProjectionWaveReady } from "@brains/contracts";
import type {
  JobHandler,
  JobInfo,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";
import type {
  ProjectionExecutionContext,
  ProjectionGraph,
  ProjectionInputContext,
  ProjectionRule,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  ProjectionRuleJobHandler,
  type ProjectionRuleDiagnostic,
  type ProjectionRuleExecutionStore,
  type ProjectionRuleJobHandlerOptions,
} from "./projection-rule-job-handler";
import {
  PROJECTION_RULE_JOB_TYPE,
  ProjectionWaveScheduler,
  type ProjectionWaveQueue,
  type ProjectionWaveStore,
} from "./projection-wave-scheduler";

export type ProjectionRuntimeStore = ProjectionWaveStore &
  ProjectionRuleExecutionStore;

export interface ProjectionRuntimeQueue extends ProjectionWaveQueue {
  enqueue(request: JobQueueEnqueueRequest): Promise<string>;
  registerHandler(type: string, handler: JobHandler, pluginId?: string): void;
  unregisterHandler(type: string): void;
}

export interface ProjectionRuntimeControls {
  now?: (() => number) | undefined;
  sweepIntervalMs?: number | undefined;
  scheduleSweep?:
    | ((intervalMs: number, sweep: () => Promise<void>) => () => void)
    | undefined;
  scheduleWakeup?:
    ((delayMs: number, wakeup: () => Promise<void>) => () => void) | undefined;
  onDiagnostic?:
    | ((diagnostic: ProjectionRuleDiagnostic) => void | Promise<void>)
    | undefined;
}

export interface ProjectionRuntimeOptions {
  store: ProjectionRuntimeStore;
  queue: ProjectionRuntimeQueue;
  setWakeup(wakeup: () => Promise<void>): () => void;
  graph: ProjectionGraph;
  rules: readonly ProjectionRule[];
  inputContext: ProjectionInputContext;
  executionContext: ProjectionExecutionContext;
  reconcileTargets: ProjectionRuleJobHandlerOptions["reconcileTargets"];
  beforeWaveCompletion: (summary: ProjectionWaveReady) => Promise<void>;
  logger: Logger;
  createWaveId: () => string;
  now: () => number;
  scheduleWakeup?: ProjectionRuntimeControls["scheduleWakeup"];
  onDiagnostic?: ProjectionRuntimeControls["onDiagnostic"];
  reconcileBatches?: (() => Promise<unknown>) | undefined;
  sweepIntervalMs?: number | undefined;
  scheduleSweep?: ProjectionRuntimeControls["scheduleSweep"];
  activationMode?: "scheduler" | "executor";
}

export interface ActiveProjectionRuntime {
  scheduler: ProjectionWaveScheduler;
  dispose(): void;
}

/** Register the sole projection handler, attach durable-ingress wakeup, and recover. */
export async function activateProjectionRuntime(
  options: ProjectionRuntimeOptions,
): Promise<ActiveProjectionRuntime> {
  const scheduler = new ProjectionWaveScheduler({
    store: options.store,
    queue: options.queue,
    graph: options.graph,
    rules: options.rules,
    createWaveId: options.createWaveId,
    beforeWaveCompletion: options.beforeWaveCompletion,
    onScheduledWakeupError: (error): void =>
      options.logger.error("Scheduled projection wakeup failed", error),
    ...(options.scheduleWakeup && { scheduleWakeup: options.scheduleWakeup }),
    now: options.now,
  });
  const handler = new ProjectionRuleJobHandler({
    rules: options.rules,
    store: options.store,
    coordinator: scheduler,
    getJobStatus: (jobId): Promise<JobInfo | null> =>
      options.queue.getStatus(jobId),
    ...(options.onDiagnostic && { onDiagnostic: options.onDiagnostic }),
    inputContext: options.inputContext,
    executionContext: options.executionContext,
    reconcileTargets: options.reconcileTargets,
    now: options.now,
  });

  options.queue.registerHandler(PROJECTION_RULE_JOB_TYPE, handler, "shell");
  let removeWakeup = (): void => {};
  let removeSweep = (): void => {};
  try {
    if (options.activationMode !== "executor") {
      const performSweep = async (): Promise<void> => {
        await options.reconcileBatches?.();
        await scheduler.startNextWave();
      };
      let activeSweep: Promise<void> | undefined;
      const sweep = (): Promise<void> => {
        if (activeSweep) return activeSweep;
        const started = performSweep();
        activeSweep = started;
        const clear = (): void => {
          if (activeSweep === started) activeSweep = undefined;
        };
        void started.then(clear, clear);
        return started;
      };
      removeWakeup = options.setWakeup(sweep);
      await sweep();
      removeSweep = (options.scheduleSweep ?? scheduleIntervalSweep)(
        options.sweepIntervalMs ?? 1_000,
        async (): Promise<void> => {
          try {
            await sweep();
          } catch (error) {
            options.logger.error("Projection coordination sweep failed", error);
          }
        },
      );
    }
  } catch (error) {
    removeSweep();
    removeWakeup();
    options.queue.unregisterHandler(PROJECTION_RULE_JOB_TYPE);
    throw error;
  }

  options.logger.debug("Projection runtime activated", {
    rules: options.rules.length,
    mode: options.activationMode ?? "scheduler",
  });
  let active = true;
  return {
    scheduler,
    dispose: (): void => {
      if (!active) return;
      active = false;
      removeSweep();
      removeWakeup();
      scheduler.dispose();
      options.queue.unregisterHandler(PROJECTION_RULE_JOB_TYPE);
    },
  };
}

function scheduleIntervalSweep(
  intervalMs: number,
  sweep: () => Promise<void>,
): () => void {
  const timer = setInterval(() => {
    void sweep();
  }, intervalMs);
  timer.unref();
  return (): void => clearInterval(timer);
}
