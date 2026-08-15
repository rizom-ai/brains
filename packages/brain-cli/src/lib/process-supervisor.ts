import { spawn, type SpawnOptions } from "node:child_process";
import { GIT_BROKER_SOCKET_ENV } from "@brains/directory-sync";
import type { CommandResult } from "./command-result";
import type {
  SignalProcess,
  SpawnBunRunnerDependencies,
  SpawnedProcess,
  SpawnImpl,
} from "./spawn-bun-runner";

export type BrainChildRole = "web" | "worker";

/**
 * Every process this supervisor owns. `git-broker` is not a Brain role — it
 * boots no shell and serves no traffic; it owns the managed checkout so web and
 * worker never execute Git themselves.
 */
export type SupervisedChildRole = BrainChildRole | "git-broker";

/**
 * Present only for a Brain with Git configured. Its absence is what makes a
 * Brain without Git start no broker.
 */
export interface GitBrokerSpec {
  /** Handed to every role; the broker binds it, the app roles connect to it. */
  readonly socketPath: string;
}

// Defined by the package that consumes it, so the supervisor and the roles
// cannot disagree about the name of the handoff.
export { GIT_BROKER_SOCKET_ENV };
type SupervisorTimer = ReturnType<typeof setTimeout> | number;
type WorkerHeartbeatTimer = ReturnType<typeof setInterval> | number;

export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
const MISSED_WORKER_HEARTBEATS_BEFORE_RESTART = 3;

export interface WorkerHeartbeatClock {
  setInterval(callback: () => void, intervalMs: number): WorkerHeartbeatTimer;
  clearInterval(handle: WorkerHeartbeatTimer): void;
}

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
  workerHeartbeatIntervalMs?: number;
  reportIncident?: (incident: Record<string, unknown>) => void;
  reportReady?: (role: SupervisedChildRole) => void;
  gitBroker?: GitBrokerSpec;
}

const defaultClock: SupervisorClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const defaultWorkerHeartbeatClock: WorkerHeartbeatClock = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle),
};

export function startWorkerHeartbeat(
  sendHeartbeat: () => void,
  clock: WorkerHeartbeatClock = defaultWorkerHeartbeatClock,
): () => void {
  const timer = clock.setInterval(sendHeartbeat, WORKER_HEARTBEAT_INTERVAL_MS);
  return (): void => clock.clearInterval(timer);
}

export function parseBrainChildRole(
  argv: readonly string[],
): SupervisedChildRole | undefined {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  if (!childArg) return undefined;

  const role = childArg.slice("--child=".length);
  if (role === "web" || role === "worker" || role === "git-broker") return role;
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

/**
 * A lost checkout owner is terminal, not restartable.
 *
 * Replacing it would mean starting a second owner while a Git child of the
 * first may still be running against the same checkout. Until the supervisor
 * can prove that process group absent, the honest move is to fail the whole
 * runtime and let external supervision remove the tree.
 */
function brokerExitResult(
  child: ManagedChild,
  code: number | null,
): CommandResult {
  if (child.startupTimedOut) {
    return {
      success: false,
      message: "Brain git broker missed its ready deadline",
      exitCode: 1,
    };
  }
  if (!child.ready) {
    return {
      success: false,
      message: "Brain git broker exited before it was ready",
      exitCode: code ?? 1,
    };
  }
  return {
    success: false,
    message: `Brain git broker exited with code ${code}`,
    exitCode: code ?? 1,
  };
}

function webExitResult(
  child: ManagedChild,
  code: number | null,
): CommandResult {
  if (child.startupTimedOut) {
    return {
      success: false,
      message: "Brain web child missed its runtime-ready deadline",
      exitCode: 1,
    };
  }
  if (!child.ready) {
    return {
      success: false,
      message: "Brain web child exited before runtime-ready",
      exitCode: code ?? 1,
    };
  }
  if (code === 0) {
    return { success: true };
  }
  return {
    success: false,
    message: `Brain web child exited with code ${code}`,
    exitCode: code ?? 1,
  };
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
  workerHeartbeatIntervalMs: number;
  reportIncident: (incident: Record<string, unknown>) => void;
  reportReady: (role: SupervisedChildRole) => void;
  gitBroker: GitBrokerSpec | undefined;
}

interface ManagedChild {
  readonly role: SupervisedChildRole;
  readonly process: SpawnedProcess;
  ready: boolean;
  closed: boolean;
  startupTimedOut: boolean;
  heartbeatTimedOut: boolean;
  startupTimer: SupervisorTimer | undefined;
  heartbeatTimer: SupervisorTimer | undefined;
  handleMessage(message: unknown): void;
}

function runRuntimeSupervisor(
  options: RuntimeSupervisorOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let parentShutdownRequested = false;
    /** The runtime's outcome once something terminal has decided it. */
    let finalResult: CommandResult | undefined;
    let broker: ManagedChild | undefined;
    let web: ManagedChild | undefined;
    let worker: ManagedChild | undefined;
    let forceKillTimer: SupervisorTimer | undefined;
    let workerRestartTimer: SupervisorTimer | undefined;
    let consecutiveWorkerFailures = 0;
    const workerAttempts: number[] = [];

    const activeChildren = (): ManagedChild[] =>
      [broker, web, worker].filter(
        (child): child is ManagedChild => child !== undefined && !child.closed,
      );

    const clearChildTimers = (child: ManagedChild): void => {
      if (child.startupTimer !== undefined) {
        options.clock.clearTimeout(child.startupTimer);
        child.startupTimer = undefined;
      }
      if (child.heartbeatTimer !== undefined) {
        options.clock.clearTimeout(child.heartbeatTimer);
        child.heartbeatTimer = undefined;
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
      if (broker) clearChildTimers(broker);
      if (web) clearChildTimers(web);
      if (worker) clearChildTimers(worker);
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

    const armWorkerHeartbeatWatchdog = (child: ManagedChild): void => {
      if (
        child.role !== "worker" ||
        !child.ready ||
        child.closed ||
        parentShutdownRequested
      ) {
        return;
      }
      if (child.heartbeatTimer !== undefined) {
        options.clock.clearTimeout(child.heartbeatTimer);
      }
      child.heartbeatTimer = options.clock.setTimeout(() => {
        child.heartbeatTimer = undefined;
        if (
          child.closed ||
          child.heartbeatTimedOut ||
          parentShutdownRequested
        ) {
          return;
        }
        child.heartbeatTimedOut = true;
        options.reportIncident({
          type: "worker-heartbeat-timeout",
          missedBeats: MISSED_WORKER_HEARTBEATS_BEFORE_RESTART,
          intervalMs: options.workerHeartbeatIntervalMs,
        });
        signalChild(child, "SIGKILL");
      }, options.workerHeartbeatIntervalMs * MISSED_WORKER_HEARTBEATS_BEFORE_RESTART);
    };

    const maybeFinish = (): void => {
      if (activeChildren().length > 0) return;
      if (finalResult) {
        finish(finalResult);
      } else if (parentShutdownRequested) {
        finish({ success: true });
      }
    };

    const requestChildrenShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      // The owner outlives its clients. A role still finishing a Git request
      // must not find the socket gone underneath it.
      signalChild(worker, signal);
      signalChild(web, signal);
      signalChild(broker, signal);
      forceKillTimer ??= options.clock.setTimeout(() => {
        signalChild(worker, "SIGKILL");
        signalChild(web, "SIGKILL");
        signalChild(broker, "SIGKILL");
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
        finalResult ||
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
        options.reportIncident({
          type: "worker-supervision-exhausted",
          attempts: workerAttempts.length,
          windowMs: options.workerRestartWindowMs,
        });
        finalResult = {
          success: false,
          message: `Brain worker restart budget exhausted after ${workerAttempts.length} attempts`,
          exitCode: 1,
        };
        parentShutdownRequested = true;
        requestChildrenShutdown("SIGTERM");
        maybeFinish();
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

    const stopEverything = (): void => {
      parentShutdownRequested = true;
      if (workerRestartTimer !== undefined) {
        options.clock.clearTimeout(workerRestartTimer);
        workerRestartTimer = undefined;
      }
      requestChildrenShutdown("SIGTERM");
    };

    const handleChildClose = (
      child: ManagedChild,
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (child.closed) return;
      child.closed = true;
      clearChildTimers(child);
      child.process.removeListener("message", child.handleMessage);

      if (child.role === "git-broker") {
        if (!parentShutdownRequested) {
          options.reportIncident({
            type: "git-broker-exited",
            code,
            signal,
            ready: child.ready,
          });
          finalResult ??= brokerExitResult(child, code);
          stopEverything();
        }
        maybeFinish();
        return;
      }

      if (child.role === "web") {
        if (!parentShutdownRequested) {
          finalResult ??= webExitResult(child, code);
          stopEverything();
        }
        maybeFinish();
        return;
      }

      if (parentShutdownRequested || finalResult) {
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

    const spawnChild = (role: SupervisedChildRole): void => {
      if (settled || parentShutdownRequested || finalResult) return;
      if (role === "worker") workerAttempts.push(options.clock.now());

      const childProcess = options.spawnImpl(
        "bun",
        [options.entrypointPath, "start", `--child=${role}`],
        {
          cwd: options.cwd,
          stdio: ["inherit", "inherit", "inherit", "ipc"],
          // The broker leads its own process group so its Git children can be
          // terminated as a unit without touching web or worker.
          detached: role === "git-broker",
          env: options.gitBroker
            ? {
                ...options.processImpl.env,
                [GIT_BROKER_SOCKET_ENV]: options.gitBroker.socketPath,
              }
            : options.processImpl.env,
        } satisfies SpawnOptions,
      );
      const child: ManagedChild = {
        role,
        process: childProcess,
        ready: false,
        closed: false,
        startupTimedOut: false,
        heartbeatTimedOut: false,
        startupTimer: undefined,
        heartbeatTimer: undefined,
        handleMessage: () => {},
      };
      if (role === "git-broker") broker = child;
      else if (role === "web") web = child;
      else worker = child;

      child.handleMessage = (message: unknown): void => {
        if (child.closed) return;
        if (role === "git-broker" && hasMessageType(message, "broker-ready")) {
          if (child.ready) return;
          child.ready = true;
          clearChildTimers(child);
          options.reportReady(role);
          // Only now may a Git-capable role start: there is no app-process
          // fallback for it to fall back to.
          spawnChild("web");
          return;
        }
        if (role === "web" && hasMessageType(message, "runtime-ready")) {
          if (child.ready) return;
          child.ready = true;
          clearChildTimers(child);
          options.reportReady(role);
          scheduleWorker();
          return;
        }
        if (role === "worker" && hasMessageType(message, "worker-ready")) {
          if (child.ready) return;
          child.ready = true;
          consecutiveWorkerFailures = 0;
          if (child.startupTimer !== undefined) {
            options.clock.clearTimeout(child.startupTimer);
            child.startupTimer = undefined;
          }
          options.reportReady(role);
          armWorkerHeartbeatWatchdog(child);
          return;
        }
        if (
          role === "worker" &&
          child.ready &&
          !child.heartbeatTimedOut &&
          hasMessageType(message, "worker-heartbeat")
        ) {
          armWorkerHeartbeatWatchdog(child);
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
    spawnChild(options.gitBroker ? "git-broker" : "web");
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
    workerHeartbeatIntervalMs:
      dependencies.workerHeartbeatIntervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS,
    gitBroker: dependencies.gitBroker,
    reportIncident:
      dependencies.reportIncident ??
      ((incident): void => {
        console.error(JSON.stringify(incident));
      }),
    reportReady:
      dependencies.reportReady ??
      ((role): void => {
        console.log(`Brain ${role} runtime ready`);
      }),
  });
}
