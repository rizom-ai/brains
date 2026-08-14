import { getErrorMessage } from "@brains/utils/error";
import type { Daemon, DaemonHealth } from "../manager/daemon-types";
import type { AccountInterfaceDaemonDefinition } from "../interface/interface-definition-contract";
import type {
  AccountSettingsRegistration,
  AccountSettingsRegistry,
  ConfiguredAccountSettings,
} from "./account-settings-registry";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";

const ACCOUNT_TASK_START_TIMEOUT_MS = 30_000;
const ACCOUNT_TASK_STOP_TIMEOUT_MS = 10_000;

interface AccountTask {
  readonly controller: AbortController;
  run: Promise<void>;
  readonly revision: number;
  status: "starting" | "ready" | "warning" | "error";
  message: string;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timeout));
}

/** Owns one account task per stored principal and reconciles on settings change. */
export function createAccountDaemon(
  definition: AccountInterfaceDaemonDefinition,
  registration: AccountSettingsRegistration,
  registry: AccountSettingsRegistry,
): Daemon {
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
      if (desired.get(actorId) !== task.revision) {
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
    const controller = new AbortController();
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const readiness = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const task: AccountTask = {
      controller,
      revision: account.revision,
      status: "starting",
      message: "Connecting",
      run: Promise.resolve(),
    };
    const run = Promise.resolve()
      .then(() =>
        definition.run({
          account: Object.freeze({
            id: account.id,
            settings: account.settings,
          }),
          signal: controller.signal,
          health: {
            ready(): void {
              task.status = "ready";
              task.message = "Ready";
              resolveReady?.();
            },
            warning(message): void {
              task.status = "warning";
              task.message = message;
            },
          },
        }),
      )
      .then(() => {
        if (!controller.signal.aborted) {
          throw new Error(
            `Account-bound daemon "${definition.id}" stopped before it was aborted`,
          );
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure =
          error instanceof Error ? error : new Error(getErrorMessage(error));
        task.status = "error";
        task.message = "Account task failed";
        rejectReady?.(failure);
      });
    task.run = run;
    tasks.set(account.id, task);

    void withTimeout(
      readiness,
      ACCOUNT_TASK_START_TIMEOUT_MS,
      `Account-bound daemon "${definition.id}" did not report readiness within ${ACCOUNT_TASK_START_TIMEOUT_MS}ms`,
    ).catch(() => {
      if (controller.signal.aborted) return;
      task.status = "error";
      task.message = "Account task did not become ready";
      controller.abort();
    });
  };

  const stopTask = async (
    actorId: string,
    task: AccountTask,
  ): Promise<void> => {
    if (tasks.get(actorId) !== task) return;
    tasks.delete(actorId);
    task.controller.abort();
    await withTimeout(
      task.run,
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
