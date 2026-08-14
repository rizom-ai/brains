import { spawn, type SpawnOptions } from "node:child_process";
import { join } from "node:path";
import type { CommandResult } from "./command-result";
import {
  GIT_BROKER_RUNTIME_DIR_ENV,
  resolveGitBrokerRuntimeDir,
} from "./git-broker-child";
import type {
  SignalProcess,
  SpawnBunRunnerDependencies,
  SpawnedProcess,
  SpawnImpl,
} from "./spawn-bun-runner";

/**
 * Supervises the Brain runtime children.
 *
 * Roles are policy-driven rather than hardcoded because the Git broker owns a
 * checkout across process boundaries: it must be ready before web or worker
 * may run a command, and it must outlive both on the way down, or a shutdown
 * would strand a request whose wrapper is still holding the advisory lock.
 */

export type BrainChildRole = "git-broker" | "web" | "worker";
type SupervisorTimer = ReturnType<typeof setTimeout> | number;
type WorkerHeartbeatTimer = ReturnType<typeof setInterval> | number;

export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
const MISSED_WORKER_HEARTBEATS_BEFORE_RESTART = 3;

const CHILD_ROLES: readonly BrainChildRole[] = ["git-broker", "web", "worker"];

/** Readiness each role announces over IPC before the next may start. */
const READY_MESSAGE_TYPE: Readonly<Record<BrainChildRole, string>> = {
  "git-broker": "broker-ready",
  web: "runtime-ready",
  worker: "worker-ready",
};

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
  /** Supervise a Git execution broker. Off for brains with no Git checkout. */
  gitBroker?: boolean;
  brokerRestartBaseMs?: number;
  brokerRestartBudget?: number;
  brokerRestartWindowMs?: number;
  reportIncident?: (incident: Record<string, unknown>) => void;
  reportReady?: (role: BrainChildRole) => void;
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

function isChildRole(value: string): value is BrainChildRole {
  return CHILD_ROLES.some((role) => role === value);
}

export function parseBrainChildRole(
  argv: readonly string[],
): BrainChildRole | undefined {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  if (!childArg) return undefined;

  const role = childArg.slice("--child=".length);
  if (isChildRole(role)) return role;
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

/** Restart budget for a role the supervisor may bring back. */
interface RestartPolicy {
  baseMs: number;
  budget: number;
  windowMs: number;
}

interface RuntimeSupervisorOptions {
  cwd: string;
  entrypointPath: string;
  spawnImpl: SpawnImpl;
  processImpl: SignalProcess;
  clock: SupervisorClock;
  startupTimeoutMs: number;
  shutdownGraceMs: number;
  workerHeartbeatIntervalMs: number;
  gitBroker: boolean;
  brokerEnv: Readonly<Record<string, string>>;
  restartPolicies: Readonly<Partial<Record<BrainChildRole, RestartPolicy>>>;
  reportIncident: (incident: Record<string, unknown>) => void;
  reportReady: (role: BrainChildRole) => void;
}

interface ManagedChild {
  readonly role: BrainChildRole;
  readonly process: SpawnedProcess;
  ready: boolean;
  closed: boolean;
  startupTimedOut: boolean;
  heartbeatTimedOut: boolean;
  startupTimer: SupervisorTimer | undefined;
  heartbeatTimer: SupervisorTimer | undefined;
  handleMessage(message: unknown): void;
}

interface RoleRuntime {
  child: ManagedChild | undefined;
  attempts: number[];
  consecutiveFailures: number;
  restartTimer: SupervisorTimer | undefined;
}

function runRuntimeSupervisor(
  options: RuntimeSupervisorOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let parentShutdownRequested = false;
    let webResult: CommandResult | undefined;
    let webSpawned = false;
    let forceKillTimer: SupervisorTimer | undefined;

    const roles = new Map<BrainChildRole, RoleRuntime>(
      CHILD_ROLES.map((role) => [
        role,
        {
          child: undefined,
          attempts: [],
          consecutiveFailures: 0,
          restartTimer: undefined,
        },
      ]),
    );

    const runtimeOf = (role: BrainChildRole): RoleRuntime => {
      const runtime = roles.get(role);
      if (!runtime) throw new Error(`Unknown Brain child role "${role}"`);
      return runtime;
    };

    const childOf = (role: BrainChildRole): ManagedChild | undefined =>
      runtimeOf(role).child;

    const isActive = (role: BrainChildRole): boolean => {
      const child = childOf(role);
      return child !== undefined && !child.closed;
    };

    const activeChildren = (): ManagedChild[] =>
      CHILD_ROLES.map(childOf).filter(
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
      CHILD_ROLES.forEach((role) => {
        const runtime = runtimeOf(role);
        if (runtime.restartTimer !== undefined) {
          options.clock.clearTimeout(runtime.restartTimer);
          runtime.restartTimer = undefined;
        }
        if (runtime.child) clearChildTimers(runtime.child);
      });
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
      if (webResult) {
        finish(webResult);
      } else if (parentShutdownRequested) {
        finish({ success: true });
      }
    };

    /**
     * The broker goes last. Its wrapper may still hold the checkout lock for a
     * request in flight, and killing the broker first would leave that request
     * with nobody to observe it reach a terminal result.
     */
    const maybeStopBroker = (signal: NodeJS.Signals): void => {
      if (isActive("web") || isActive("worker")) return;
      signalChild(childOf("git-broker"), signal);
    };

    const requestChildrenShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      signalChild(childOf("worker"), signal);
      signalChild(childOf("web"), signal);
      maybeStopBroker(signal);
      forceKillTimer ??= options.clock.setTimeout(() => {
        CHILD_ROLES.forEach((role) => signalChild(childOf(role), "SIGKILL"));
      }, options.shutdownGraceMs);
    };

    const requestParentShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      parentShutdownRequested = true;
      CHILD_ROLES.forEach((role) => {
        const runtime = runtimeOf(role);
        if (runtime.restartTimer !== undefined) {
          options.clock.clearTimeout(runtime.restartTimer);
          runtime.restartTimer = undefined;
        }
      });
      requestChildrenShutdown(signal);
      maybeFinish();
    };

    const exhaustBudget = (role: BrainChildRole, attempts: number): void => {
      options.reportIncident({
        type: `${role}-supervision-exhausted`,
        attempts,
        windowMs: options.restartPolicies[role]?.windowMs,
      });
      webResult = {
        success: false,
        message: `Brain ${role} restart budget exhausted after ${attempts} attempts`,
        exitCode: 1,
      };
      parentShutdownRequested = true;
      requestChildrenShutdown("SIGTERM");
      maybeFinish();
    };

    const scheduleRole = (role: BrainChildRole): void => {
      const policy = options.restartPolicies[role];
      const runtime = runtimeOf(role);
      if (
        !policy ||
        settled ||
        parentShutdownRequested ||
        webResult ||
        isActive(role) ||
        runtime.restartTimer !== undefined
      ) {
        return;
      }
      // The worker only exists to serve a ready web child.
      if (
        role === "worker" &&
        (!childOf("web")?.ready || isActive("web") === false)
      ) {
        return;
      }

      const now = options.clock.now();
      const withinWindow = runtime.attempts.filter(
        (attempt) => now - attempt < policy.windowMs,
      );
      runtime.attempts = withinWindow;

      if (withinWindow.length >= policy.budget) {
        exhaustBudget(role, withinWindow.length);
        return;
      }

      const delayMs =
        runtime.consecutiveFailures === 0
          ? 0
          : policy.baseMs * 2 ** Math.min(runtime.consecutiveFailures - 1, 10);
      if (delayMs === 0) {
        spawnChild(role);
        return;
      }
      runtime.restartTimer = options.clock.setTimeout(() => {
        runtime.restartTimer = undefined;
        spawnChild(role);
      }, delayMs);
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

      if (child.role === "web") {
        if (!parentShutdownRequested) {
          webResult = webExitResult(child, code);
          const workerRuntime = runtimeOf("worker");
          if (workerRuntime.restartTimer !== undefined) {
            options.clock.clearTimeout(workerRuntime.restartTimer);
            workerRuntime.restartTimer = undefined;
          }
          requestChildrenShutdown("SIGTERM");
        } else {
          maybeStopBroker("SIGTERM");
        }
        maybeFinish();
        return;
      }

      if (parentShutdownRequested || webResult) {
        if (child.role === "worker") maybeStopBroker("SIGTERM");
        maybeFinish();
        return;
      }

      const runtime = runtimeOf(child.role);
      runtime.consecutiveFailures += 1;
      options.reportIncident({
        type: `${child.role}-exited`,
        code,
        signal,
        ready: child.ready,
      });
      scheduleRole(child.role);
    };

    const spawnChild = (role: BrainChildRole): void => {
      if (settled || parentShutdownRequested || webResult) return;
      const runtime = runtimeOf(role);
      if (options.restartPolicies[role]) {
        runtime.attempts.push(options.clock.now());
      }
      if (role === "web") webSpawned = true;

      const childProcess = options.spawnImpl(
        "bun",
        [options.entrypointPath, "start", `--child=${role}`],
        {
          cwd: options.cwd,
          stdio: ["inherit", "inherit", "inherit", "ipc"],
          // Every child resolves the same socket, so web and worker cannot
          // disagree with the broker about which checkout owner they share.
          env: { ...options.processImpl.env, ...options.brokerEnv },
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
      runtime.child = child;

      child.handleMessage = (message: unknown): void => {
        if (child.closed) return;
        if (hasMessageType(message, READY_MESSAGE_TYPE[role])) {
          if (child.ready) return;
          child.ready = true;
          runtime.consecutiveFailures = 0;
          clearChildTimers(child);
          options.reportReady(role);

          if (role === "git-broker" && !webSpawned) spawnChild("web");
          if (role === "web") scheduleRole("worker");
          if (role === "worker") armWorkerHeartbeatWatchdog(child);
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
    // The broker owns the checkout, so nothing that runs Git may start before
    // it reports ready.
    spawnChild(options.gitBroker ? "git-broker" : "web");
  });
}

/** Own the same-bundle web child, its restartable worker sibling, and the Git broker. */
export function superviseRuntimeChildren(
  cwd: string,
  entrypointPath: string,
  dependencies: ProcessSupervisorDependencies = {},
): Promise<CommandResult> {
  const gitBroker = dependencies.gitBroker ?? true;
  const brokerRuntimeDir = resolveGitBrokerRuntimeDir(
    cwd,
    (dependencies.processImpl ?? process).env,
  );

  return runRuntimeSupervisor({
    cwd,
    entrypointPath,
    spawnImpl: dependencies.spawnImpl ?? spawn,
    processImpl: dependencies.processImpl ?? process,
    clock: dependencies.clock ?? defaultClock,
    startupTimeoutMs: dependencies.startupTimeoutMs ?? 30_000,
    shutdownGraceMs: dependencies.shutdownGraceMs ?? 15_000,
    workerHeartbeatIntervalMs:
      dependencies.workerHeartbeatIntervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS,
    gitBroker,
    brokerEnv: gitBroker
      ? {
          [GIT_BROKER_RUNTIME_DIR_ENV]: brokerRuntimeDir,
          BRAIN_GIT_BROKER_SOCKET: join(brokerRuntimeDir, "git-broker.sock"),
        }
      : {},
    restartPolicies: {
      worker: {
        baseMs: dependencies.workerRestartBaseMs ?? 1_000,
        budget: dependencies.workerRestartBudget ?? 3,
        windowMs: dependencies.workerRestartWindowMs ?? 3_600_000,
      },
      "git-broker": {
        baseMs: dependencies.brokerRestartBaseMs ?? 1_000,
        budget: dependencies.brokerRestartBudget ?? 3,
        windowMs: dependencies.brokerRestartWindowMs ?? 3_600_000,
      },
    },
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
