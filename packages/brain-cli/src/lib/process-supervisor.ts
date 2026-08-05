import { spawn, type SpawnOptions } from "node:child_process";
import type { CommandResult } from "./command-result";
import type {
  SignalProcess,
  SpawnBunRunnerDependencies,
  SpawnedProcess,
  SpawnImpl,
} from "./spawn-bun-runner";

export type BrainChildRole = "web" | "worker";
type SupervisorTimer = ReturnType<typeof setTimeout> | number;

export interface SupervisorClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): SupervisorTimer;
  clearTimeout(handle: SupervisorTimer): void;
}

export interface ProcessSupervisorDependencies extends SpawnBunRunnerDependencies {
  argv?: readonly string[];
  entrypointPath?: string;
  clock?: SupervisorClock;
  startupTimeoutMs?: number;
  shutdownGraceMs?: number;
  workerRestartBaseMs?: number;
  workerRestartBudget?: number;
  workerRestartWindowMs?: number;
  reportIncident?: (incident: Record<string, unknown>) => void;
}

const defaultClock: SupervisorClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export function parseBrainChildRole(
  argv: readonly string[],
): BrainChildRole | undefined {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  if (!childArg) return undefined;

  const role = childArg.slice("--child=".length);
  if (role === "web" || role === "worker") return role;
  throw new Error(`Invalid internal Brain child role "${role}"`);
}

function hasMessageType(value: unknown, type: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === type
  );
}

interface RuntimeSupervisorOptions {
  cwd: string;
  entrypointPath: string;
  spawnImpl: SpawnImpl;
  processImpl: SignalProcess;
  clock: SupervisorClock;
  startupTimeoutMs: number;
  shutdownGraceMs: number;
  workerRestartBaseMs: number;
  workerRestartBudget: number;
  workerRestartWindowMs: number;
  reportIncident: (incident: Record<string, unknown>) => void;
}

interface ManagedChild {
  readonly role: BrainChildRole;
  readonly process: SpawnedProcess;
  ready: boolean;
  closed: boolean;
  startupTimedOut: boolean;
  startupTimer: SupervisorTimer | undefined;
  handleMessage(message: unknown): void;
}

function runRuntimeSupervisor(
  options: RuntimeSupervisorOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let parentShutdownRequested = false;
    let webResult: CommandResult | undefined;
    let web: ManagedChild | undefined;
    let worker: ManagedChild | undefined;
    let forceKillTimer: SupervisorTimer | undefined;
    let workerRestartTimer: SupervisorTimer | undefined;
    let consecutiveWorkerFailures = 0;
    const workerAttempts: number[] = [];

    const activeChildren = (): ManagedChild[] =>
      [web, worker].filter(
        (child): child is ManagedChild => child !== undefined && !child.closed,
      );

    const clearChildTimer = (child: ManagedChild): void => {
      if (child.startupTimer !== undefined) {
        options.clock.clearTimeout(child.startupTimer);
        child.startupTimer = undefined;
      }
    };

    const cleanup = (): void => {
      options.processImpl.removeListener("SIGINT", handleSigint);
      options.processImpl.removeListener("SIGTERM", handleSigterm);
      options.processImpl.removeListener("exit", handleParentExit);
      if (forceKillTimer !== undefined) {
        options.clock.clearTimeout(forceKillTimer);
      }
      if (workerRestartTimer !== undefined) {
        options.clock.clearTimeout(workerRestartTimer);
      }
      if (web) clearChildTimer(web);
      if (worker) clearChildTimer(worker);
    };

    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const signalChild = (
      child: ManagedChild | undefined,
      signal: NodeJS.Signals,
    ): void => {
      if (!child || child.closed || child.process.exitCode !== null) return;
      try {
        child.process.kill(signal);
      } catch {
        // The child won the race and has already exited.
      }
    };

    const maybeFinish = (): void => {
      if (activeChildren().length > 0) return;
      if (webResult) {
        finish(webResult);
      } else if (parentShutdownRequested) {
        finish({ success: true });
      }
    };

    const requestChildrenShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      signalChild(worker, signal);
      signalChild(web, signal);
      forceKillTimer ??= options.clock.setTimeout(() => {
        signalChild(worker, "SIGKILL");
        signalChild(web, "SIGKILL");
      }, options.shutdownGraceMs);
    };

    const requestParentShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      parentShutdownRequested = true;
      if (workerRestartTimer !== undefined) {
        options.clock.clearTimeout(workerRestartTimer);
        workerRestartTimer = undefined;
      }
      requestChildrenShutdown(signal);
      maybeFinish();
    };

    const scheduleWorker = (): void => {
      if (
        settled ||
        parentShutdownRequested ||
        webResult ||
        !web?.ready ||
        web.closed ||
        (worker !== undefined && !worker.closed) ||
        workerRestartTimer !== undefined
      ) {
        return;
      }

      const now = options.clock.now();
      while (
        workerAttempts.length > 0 &&
        now - (workerAttempts[0] ?? now) >= options.workerRestartWindowMs
      ) {
        workerAttempts.shift();
      }

      if (workerAttempts.length >= options.workerRestartBudget) {
        const retryAt =
          (workerAttempts[0] ?? now) + options.workerRestartWindowMs;
        options.reportIncident({
          type: "worker-supervision-paused",
          attempts: workerAttempts.length,
          retryAt,
        });
        workerRestartTimer = options.clock.setTimeout(
          () => {
            workerRestartTimer = undefined;
            scheduleWorker();
          },
          Math.max(0, retryAt - now),
        );
        return;
      }

      const delayMs =
        consecutiveWorkerFailures === 0
          ? 0
          : options.workerRestartBaseMs *
            2 ** Math.min(consecutiveWorkerFailures - 1, 10);
      if (delayMs === 0) {
        spawnChild("worker");
        return;
      }
      workerRestartTimer = options.clock.setTimeout(() => {
        workerRestartTimer = undefined;
        spawnChild("worker");
      }, delayMs);
    };

    const handleChildClose = (
      child: ManagedChild,
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (child.closed) return;
      child.closed = true;
      clearChildTimer(child);
      child.process.removeListener("message", child.handleMessage);

      if (child.role === "web") {
        if (!parentShutdownRequested) {
          webResult = child.startupTimedOut
            ? {
                success: false,
                message: "Brain web child missed its runtime-ready deadline",
                exitCode: 1,
              }
            : !child.ready
              ? {
                  success: false,
                  message: "Brain web child exited before runtime-ready",
                  exitCode: code ?? 1,
                }
              : code === 0
                ? { success: true }
                : {
                    success: false,
                    message: `Brain web child exited with code ${code}`,
                    exitCode: code ?? 1,
                  };
          if (workerRestartTimer !== undefined) {
            options.clock.clearTimeout(workerRestartTimer);
            workerRestartTimer = undefined;
          }
          requestChildrenShutdown("SIGTERM");
        }
        maybeFinish();
        return;
      }

      if (parentShutdownRequested || webResult) {
        maybeFinish();
        return;
      }

      consecutiveWorkerFailures += 1;
      options.reportIncident({
        type: "worker-exited",
        code,
        signal,
        ready: child.ready,
      });
      scheduleWorker();
    };

    const spawnChild = (role: BrainChildRole): void => {
      if (settled || parentShutdownRequested || webResult) return;
      if (role === "worker") workerAttempts.push(options.clock.now());

      const childProcess = options.spawnImpl(
        "bun",
        [options.entrypointPath, "start", `--child=${role}`],
        {
          cwd: options.cwd,
          stdio: ["inherit", "inherit", "inherit", "ipc"],
          env: options.processImpl.env,
        } satisfies SpawnOptions,
      );
      const child: ManagedChild = {
        role,
        process: childProcess,
        ready: false,
        closed: false,
        startupTimedOut: false,
        startupTimer: undefined,
        handleMessage: () => {},
      };
      if (role === "web") web = child;
      else worker = child;

      child.handleMessage = (message: unknown): void => {
        if (child.closed) return;
        if (role === "web" && hasMessageType(message, "runtime-ready")) {
          child.ready = true;
          clearChildTimer(child);
          scheduleWorker();
          return;
        }
        if (role === "worker" && hasMessageType(message, "worker-ready")) {
          child.ready = true;
          consecutiveWorkerFailures = 0;
          clearChildTimer(child);
        }
      };
      child.startupTimer = options.clock.setTimeout(() => {
        if (child.ready || child.closed) return;
        child.startupTimedOut = true;
        options.reportIncident({
          type: `${role}-startup-timeout`,
          timeoutMs: options.startupTimeoutMs,
        });
        signalChild(child, "SIGKILL");
      }, options.startupTimeoutMs);

      childProcess.on("message", child.handleMessage);
      childProcess.on("error", (error) => {
        options.reportIncident({
          type: `${role}-spawn-error`,
          message: error.message,
        });
      });
      childProcess.on("close", (code, signal) => {
        handleChildClose(child, code, signal);
      });
    };

    const handleSigint = (): void => requestParentShutdown("SIGINT");
    const handleSigterm = (): void => requestParentShutdown("SIGTERM");
    const handleParentExit = (): void => requestParentShutdown("SIGTERM");

    options.processImpl.on("SIGINT", handleSigint);
    options.processImpl.on("SIGTERM", handleSigterm);
    options.processImpl.on("exit", handleParentExit);
    spawnChild("web");
  });
}

/** Own the same-bundle web child and its restartable worker sibling. */
export function superviseRuntimeChildren(
  cwd: string,
  entrypointPath: string,
  dependencies: ProcessSupervisorDependencies = {},
): Promise<CommandResult> {
  return runRuntimeSupervisor({
    cwd,
    entrypointPath,
    spawnImpl: dependencies.spawnImpl ?? spawn,
    processImpl: dependencies.processImpl ?? process,
    clock: dependencies.clock ?? defaultClock,
    startupTimeoutMs: dependencies.startupTimeoutMs ?? 30_000,
    shutdownGraceMs: dependencies.shutdownGraceMs ?? 15_000,
    workerRestartBaseMs: dependencies.workerRestartBaseMs ?? 1_000,
    workerRestartBudget: dependencies.workerRestartBudget ?? 3,
    workerRestartWindowMs: dependencies.workerRestartWindowMs ?? 3_600_000,
    reportIncident:
      dependencies.reportIncident ??
      ((incident): void => {
        console.error(JSON.stringify(incident));
      }),
  });
}
