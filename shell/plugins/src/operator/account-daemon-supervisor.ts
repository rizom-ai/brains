import { toError } from "@brains/utils/error";
import type { Daemon, DaemonHealth } from "../manager/daemon-types";
import type { AccountInterfaceDaemonDefinition } from "../interface/interface-definition-contract";
import {
  createRestartBackoff,
  daemonTimers,
  withDaemonTimeout,
  type DaemonSupervision,
  type RestartBackoff,
} from "../interface/daemon-restart";
import type {
  AccountSettingsRegistration,
  AccountSettingsRegistry,
  ConfiguredAccountSettings,
} from "./account-settings-registry";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";

const ACCOUNT_TASK_START_TIMEOUT_MS = 30_000;
const ACCOUNT_TASK_STOP_TIMEOUT_MS = 10_000;

interface AccountTask {
  readonly account: ConfiguredAccountSettings<AnyAccountSettingsDefinition>;
  readonly backoff: RestartBackoff;
  /** The current run's controller and its run, settled whichever way it ends. */
  controller: AbortController;
  run: Promise<void>;
  status: "starting" | "ready" | "warning" | "error";
  message: string;
  /** Whether a run reported ready for this revision, which makes failures restart. */
  everReady: boolean;
  /** Set once the task is stopped; nothing restarts it after. */
  stopped: boolean;
  cancelRestart: (() => void) | undefined;
}

/**
 * Owns one account task per stored principal and reconciles on settings
 * change. Once a task has been ready, a failure is logged and the task
 * restarted with backoff until it is stopped; a task that fails before it
 * was ever ready stays failed until its settings change.
 */
export function createAccountDaemon(
  definition: AccountInterfaceDaemonDefinition,
  registration: AccountSettingsRegistration,
  registry: AccountSettingsRegistry,
  supervision: DaemonSupervision,
): Daemon {
  const { logger } = supervision;
  const timers = daemonTimers(supervision);
  let active = false;
  let lifecycleRevision = 0;
  let lastReconcileError: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let reconcileTail: Promise<void> = Promise.resolve();
  const tasks = new Map<string, AccountTask>();

  const reconcile = (): Promise<void> => {
    const operation = reconcileTail
      .catch(() => undefined)
      .then(() => reconcileNow());
    reconcileTail = operation.then(
      () => {
        lastReconcileError = undefined;
      },
      (_error: unknown) => {
        lastReconcileError = "Account task reconciliation failed";
      },
    );
    return operation;
  };

  const reconcileNow = async (): Promise<void> => {
    if (!active) return;
    const currentLifecycle = lifecycleRevision;
    const configured = await registry.listConfigured(registration);
    if (currentLifecycle !== lifecycleRevision) return;
    const desired = new Map<string, number>(
      configured.map((account) => [account.id, account.revision]),
    );

    for (const [actorId, task] of tasks) {
      if (desired.get(actorId) !== task.account.revision) {
        await stopTask(actorId, task);
      }
    }
    if (currentLifecycle !== lifecycleRevision) return;
    for (const account of configured) {
      if (!tasks.has(account.id)) startTask(account);
    }
  };

  const startTask = (
    account: ConfiguredAccountSettings<AnyAccountSettingsDefinition>,
  ): void => {
    const task: AccountTask = {
      account,
      backoff: createRestartBackoff(supervision.random),
      controller: new AbortController(),
      run: Promise.resolve(),
      status: "starting",
      message: "Connecting",
      everReady: false,
      stopped: false,
      cancelRestart: undefined,
    };
    tasks.set(account.id, task);
    runTask(task);
  };

  const failTask = (task: AccountTask, failure: Error): void => {
    const context = {
      daemon: definition.id,
      account: task.account.id,
      error: failure.message,
    };
    if (!task.everReady) {
      logger.error(
        `Account-bound daemon "${definition.id}" task failed before it was ready`,
        context,
      );
      return;
    }
    const delayMs = task.backoff.next();
    logger.error(
      `Account-bound daemon "${definition.id}" task failed; restarting in ${delayMs}ms`,
      { ...context, restartInMs: delayMs },
    );
    task.cancelRestart = timers.schedule(() => {
      task.cancelRestart = undefined;
      if (!task.stopped) runTask(task);
    }, delayMs);
  };

  const runTask = (task: AccountTask): void => {
    const controller = new AbortController();
    task.controller = controller;
    let timedOut: Error | undefined;
    const cancelReadinessTimeout = timers.schedule(() => {
      timedOut = new Error(
        `Account-bound daemon "${definition.id}" did not report readiness within ${ACCOUNT_TASK_START_TIMEOUT_MS}ms`,
      );
      task.status = "error";
      task.message = "Account task did not become ready";
      controller.abort();
    }, ACCOUNT_TASK_START_TIMEOUT_MS);

    const settled = (error: Error | undefined): void => {
      cancelReadinessTimeout();
      if (task.stopped) return;
      const failure =
        timedOut ??
        error ??
        new Error(
          `Account-bound daemon "${definition.id}" stopped before it was aborted`,
        );
      // Whatever the failed run left listening on its signal lets go now.
      controller.abort();
      task.status = "error";
      task.message = timedOut
        ? "Account task did not become ready"
        : "Account task failed";
      failTask(task, failure);
    };

    task.run = Promise.resolve()
      .then(() =>
        definition.run({
          account: Object.freeze({
            id: task.account.id,
            settings: task.account.settings,
          }),
          signal: controller.signal,
          health: {
            ready(): void {
              if (controller.signal.aborted) return;
              cancelReadinessTimeout();
              task.everReady = true;
              task.backoff.reset();
              task.status = "ready";
              task.message = "Ready";
            },
            warning(message): void {
              if (controller.signal.aborted) return;
              task.status = "warning";
              task.message = message;
            },
          },
        }),
      )
      .then(
        () => settled(undefined),
        (error: unknown) => settled(toError(error)),
      );
  };

  const stopTask = async (
    actorId: string,
    task: AccountTask,
  ): Promise<void> => {
    if (tasks.get(actorId) !== task) return;
    tasks.delete(actorId);
    task.stopped = true;
    task.cancelRestart?.();
    task.cancelRestart = undefined;
    task.controller.abort();
    await withDaemonTimeout(
      task.run,
      timers,
      ACCOUNT_TASK_STOP_TIMEOUT_MS,
      `Account-bound daemon "${definition.id}" task did not stop within ${ACCOUNT_TASK_STOP_TIMEOUT_MS}ms`,
    ).catch(() => undefined);
  };

  return {
    async start(): Promise<void> {
      if (active) return;
      active = true;
      lifecycleRevision++;
      unsubscribe = registry.subscribe(registration, () => {
        void reconcile();
      });
      await reconcile();
    },

    async stop(): Promise<void> {
      if (!active && tasks.size === 0) return;
      active = false;
      lifecycleRevision++;
      unsubscribe?.();
      unsubscribe = undefined;
      await reconcileTail.catch(() => undefined);
      const current = [...tasks.entries()];
      await Promise.all(
        current.map(([actorId, task]) => stopTask(actorId, task)),
      );
    },

    healthCheck(): Promise<DaemonHealth> {
      const summary = { total: tasks.size, ready: 0, warning: 0, error: 0 };
      for (const task of tasks.values()) {
        if (task.status === "ready") summary.ready++;
        else if (task.status === "warning") summary.warning++;
        else if (task.status === "error") summary.error++;
      }
      const status: DaemonHealth["status"] =
        lastReconcileError || summary.error > 0
          ? "error"
          : summary.warning > 0
            ? "warning"
            : "healthy";
      return Promise.resolve({
        status,
        message:
          lastReconcileError ??
          (summary.total === 0
            ? "No configured accounts"
            : `${summary.ready} of ${summary.total} account task(s) ready`),
        lastCheck: new Date(),
        details: summary,
      });
    },
  };
}
