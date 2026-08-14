import type { ProjectionWaveReady } from "@brains/contracts";
import type { JobHandler, JobQueueEnqueueRequest } from "@brains/job-queue";
import type {
  ProjectionExecutionContext,
  ProjectionGraph,
  ProjectionInputContext,
  ProjectionRule,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  ProjectionRuleJobHandler,
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
    now: options.now,
  });
  const handler = new ProjectionRuleJobHandler({
    rules: options.rules,
    store: options.store,
    coordinator: scheduler,
    inputContext: options.inputContext,
    executionContext: options.executionContext,
    reconcileTargets: options.reconcileTargets,
    now: options.now,
  });

  options.queue.registerHandler(PROJECTION_RULE_JOB_TYPE, handler, "shell");
  let removeWakeup = (): void => {};
  try {
    if (options.activationMode !== "executor") {
      removeWakeup = options.setWakeup(async (): Promise<void> => {
        await scheduler.startNextWave();
      });
      await scheduler.startNextWave();
    }
  } catch (error) {
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
      removeWakeup();
      scheduler.dispose();
      options.queue.unregisterHandler(PROJECTION_RULE_JOB_TYPE);
    },
  };
}
