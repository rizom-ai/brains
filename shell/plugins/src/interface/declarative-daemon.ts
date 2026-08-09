import type { Daemon, DaemonHealth } from "../manager/daemon-types";
import type { InterfaceDaemonDefinition } from "./interface-definition-contract";

const DAEMON_READINESS_TIMEOUT_MS = 30_000;
const DAEMON_SHUTDOWN_TIMEOUT_MS = 10_000;

export function createDeclarativeDaemon(
  definition: InterfaceDaemonDefinition,
): Daemon {
  let controller: AbortController | undefined;
  let runTask: Promise<void> | undefined;
  let health: DaemonHealth = {
    status: "unknown",
    message: "Waiting for readiness",
    lastCheck: new Date(),
  };

  return {
    async start(): Promise<void> {
      if (controller) return;
      controller = new AbortController();
      const runController = controller;

      let resolveReady: (() => void) | undefined;
      let rejectReady: ((error: Error) => void) | undefined;
      const readiness = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });

      runTask = Promise.resolve()
        .then(() =>
          definition.run({
            signal: runController.signal,
            health: {
              ready(): void {
                health = {
                  status: "healthy",
                  message: "Ready",
                  lastCheck: new Date(),
                };
                resolveReady?.();
              },
              warning(message): void {
                health = {
                  status: "warning",
                  message,
                  lastCheck: new Date(),
                };
              },
            },
          }),
        )
        .then(() => {
          if (!runController.signal.aborted) {
            throw new Error(
              `Daemon "${definition.id}" stopped before it was aborted`,
            );
          }
        })
        .catch((error: unknown) => {
          const failure =
            error instanceof Error ? error : new Error(String(error));
          health = {
            status: "error",
            message: failure.message,
            lastCheck: new Date(),
          };
          rejectReady?.(failure);
          throw failure;
        });
      runTask.catch(() => undefined);
      let readinessTimeout: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((_resolve, reject) => {
        readinessTimeout = setTimeout(() => {
          const failure = new Error(
            `Daemon "${definition.id}" did not report readiness within ${DAEMON_READINESS_TIMEOUT_MS}ms`,
          );
          health = {
            status: "error",
            message: failure.message,
            lastCheck: new Date(),
          };
          runController.abort();
          reject(failure);
        }, DAEMON_READINESS_TIMEOUT_MS);
      });
      try {
        await Promise.race([readiness, timeout]);
      } finally {
        clearTimeout(readinessTimeout);
      }
    },

    async stop(): Promise<void> {
      const activeController = controller;
      const activeTask = runTask;
      controller = undefined;
      runTask = undefined;
      activeController?.abort();
      let shutdownTimeout: ReturnType<typeof setTimeout> | undefined;
      const completed = activeTask
        ? await Promise.race([
            activeTask.then(
              () => true,
              () => true,
            ),
            new Promise<false>((resolve) => {
              shutdownTimeout = setTimeout(
                () => resolve(false),
                DAEMON_SHUTDOWN_TIMEOUT_MS,
              );
            }),
          ])
        : true;
      clearTimeout(shutdownTimeout);
      if (!completed) {
        health = {
          status: "error",
          message: `Daemon "${definition.id}" did not stop within ${DAEMON_SHUTDOWN_TIMEOUT_MS}ms`,
          lastCheck: new Date(),
        };
      }
      if (health.status !== "error") {
        health = {
          status: "unknown",
          message: "Stopped",
          lastCheck: new Date(),
        };
      }
    },

    healthCheck(): Promise<DaemonHealth> {
      return Promise.resolve({ ...health, lastCheck: new Date() });
    },
  };
}
