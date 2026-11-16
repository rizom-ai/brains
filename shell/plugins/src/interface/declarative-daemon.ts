import { toError } from "@brains/utils/error";
import type { Daemon, DaemonHealth } from "../manager/daemon-types";
import type { InterfaceDaemonDefinition } from "./interface-definition-contract";
import {
  createRestartBackoff,
  daemonTimers,
  withDaemonTimeout,
  type DaemonSupervision,
} from "./daemon-restart";

const DAEMON_READINESS_TIMEOUT_MS = 30_000;
const DAEMON_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Supervises one run-based daemon. `start` resolves once the run reports
 * ready and rejects if it fails first. Once a run has been ready, a failure is
 * logged and the run restarted with backoff until `stop`; health stays
 * `error` until a restarted run reports ready.
 */
export function createDeclarativeDaemon(
  definition: InterfaceDaemonDefinition,
  supervision: DaemonSupervision,
): Daemon {
  const { logger } = supervision;
  const timers = daemonTimers(supervision);
  const backoff = createRestartBackoff(supervision.random);
  /** Aborted by `stop`; present while the daemon is started. */
  let lifetime: AbortController | undefined;
  /** The current run, settled whichever way it ends. */
  let current: Promise<void> | undefined;
  let cancelRestart: (() => void) | undefined;
  /** Whether a run reported ready since `start`, which makes failures restart. */
  let everReady = false;
  let health: DaemonHealth = {
    status: "unknown",
    message: "Waiting for readiness",
    lastCheck: new Date(),
  };
  const setHealth = (status: DaemonHealth["status"], message: string): void => {
    health = { status, message, lastCheck: new Date() };
  };

  const scheduleRestart = (owner: AbortController, failure: Error): void => {
    const delayMs = backoff.next();
    logger.error(
      `Daemon "${definition.id}" failed; restarting in ${delayMs}ms`,
      { daemon: definition.id, error: failure.message, restartInMs: delayMs },
    );
    cancelRestart = timers.schedule(() => {
      cancelRestart = undefined;
      if (lifetime !== owner) return;
      launch(owner).catch(() => undefined);
    }, delayMs);
  };

  /**
   * Run once under `owner`: resolves when the run reports ready, rejects if
   * it fails or does not report ready in time.
   */
  const launch = (owner: AbortController): Promise<void> => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    owner.signal.addEventListener("abort", abort, { once: true });
    let timedOut: Error | undefined;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const readiness = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const cancelReadinessTimeout = timers.schedule(() => {
      timedOut = new Error(
        `Daemon "${definition.id}" did not report readiness within ${DAEMON_READINESS_TIMEOUT_MS}ms`,
      );
      setHealth("error", timedOut.message);
      rejectReady?.(timedOut);
      controller.abort();
    }, DAEMON_READINESS_TIMEOUT_MS);

    const settled = (error: Error | undefined): void => {
      cancelReadinessTimeout();
      owner.signal.removeEventListener("abort", abort);
      if (owner.signal.aborted) {
        rejectReady?.(
          new Error(`Daemon "${definition.id}" stopped before it was ready`),
        );
        return;
      }
      const failure =
        timedOut ??
        error ??
        new Error(`Daemon "${definition.id}" stopped before it was aborted`);
      // Whatever the failed run left listening on its signal lets go now.
      controller.abort();
      setHealth("error", failure.message);
      rejectReady?.(failure);
      if (everReady) scheduleRestart(owner, failure);
    };

    current = Promise.resolve()
      .then(() =>
        definition.run({
          signal: controller.signal,
          health: {
            ready(): void {
              if (controller.signal.aborted) return;
              cancelReadinessTimeout();
              everReady = true;
              backoff.reset();
              setHealth("healthy", "Ready");
              resolveReady?.();
            },
            warning(message): void {
              if (controller.signal.aborted) return;
              setHealth("warning", message);
            },
          },
        }),
      )
      .then(
        () => settled(undefined),
        (error: unknown) => settled(toError(error)),
      );
    return readiness;
  };

  return {
    async start(): Promise<void> {
      if (lifetime) return;
      const owner = new AbortController();
      lifetime = owner;
      everReady = false;
      backoff.reset();
      await launch(owner);
    },

    async stop(): Promise<void> {
      const owner = lifetime;
      const active = current;
      lifetime = undefined;
      current = undefined;
      cancelRestart?.();
      cancelRestart = undefined;
      owner?.abort();
      const completed = active
        ? await withDaemonTimeout(
            active.then(() => true),
            timers,
            DAEMON_SHUTDOWN_TIMEOUT_MS,
            `Daemon "${definition.id}" did not stop`,
          ).catch(() => false)
        : true;
      if (!completed) {
        setHealth(
          "error",
          `Daemon "${definition.id}" did not stop within ${DAEMON_SHUTDOWN_TIMEOUT_MS}ms`,
        );
      }
      if (health.status !== "error") setHealth("unknown", "Stopped");
    },

    healthCheck(): Promise<DaemonHealth> {
      return Promise.resolve({ ...health, lastCheck: new Date() });
    },
  };
}
