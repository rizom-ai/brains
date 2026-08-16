import { spawn, type SpawnOptions } from "node:child_process";
import {
  BROKER_PROGRESS_TIMEOUT_MS,
  GIT_BROKER_SOCKET_ENV,
} from "@brains/directory-sync";
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

export const BROKER_HEARTBEAT_INTERVAL_MS = 5_000;
const MISSED_BROKER_HEARTBEATS_BEFORE_TERMINATION = 3;

// One policy, defined with the broker it describes, so a health report and a
// termination decision cannot disagree about what stalled means.
export { BROKER_PROGRESS_TIMEOUT_MS };

/** How the old owner's group is proven gone before a replacement may start. */
export const BROKER_GROUP_PROBE_INTERVAL_MS = 500;
export const BROKER_GROUP_PROBE_ATTEMPTS = 20;

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
  brokerHeartbeatIntervalMs?: number;
  brokerProgressTimeoutMs?: number;
  brokerGroupProbeIntervalMs?: number;
  brokerGroupProbeAttempts?: number;
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

interface Heartbeat {
  activeRequestIds: string[];
  oldestActiveProgressAt: number | null;
}

/** Structural, and unparseable beats are ignored rather than trusted. */
function readHeartbeat(value: unknown): Heartbeat | undefined {
  if (!hasMessageType(value, "broker-heartbeat")) return undefined;
  if (typeof value !== "object" || value === null) return undefined;
  if (!("activeRequestIds" in value) || !("oldestActiveProgressAt" in value)) {
    return undefined;
  }
  const { activeRequestIds, oldestActiveProgressAt } = value;
  if (!Array.isArray(activeRequestIds)) return undefined;
  if (!activeRequestIds.every((id) => typeof id === "string")) return undefined;
  if (
    oldestActiveProgressAt !== null &&
    typeof oldestActiveProgressAt !== "number"
  ) {
    return undefined;
  }
  return { activeRequestIds, oldestActiveProgressAt };
}

/** ESRCH is the only answer that means "gone". */
function isNoSuchProcess(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
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
  brokerHeartbeatIntervalMs: number;
  brokerProgressTimeoutMs: number;
  brokerGroupProbeIntervalMs: number;
  brokerGroupProbeAttempts: number;
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
    let shutdownSignal: "SIGINT" | "SIGTERM" | undefined;
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
        // The broker's Git children inherit its process group, so the group is
        // what has to stop. A broker that exits while a Git child survives is
        // exactly the state no replacement may ever start into.
        if (child.role === "git-broker" && child.process.pid !== undefined) {
          options.processImpl.kill(-child.process.pid, signal);
          return;
        }
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

    /**
     * Silence is the only signal a wedged owner gives.
     *
     * It does not exit — that is the shape of the defect being survived — so
     * there is no process event to wait for, and the parent watches these
     * facts rather than depending on a health request arriving.
     */
    const armBrokerWatchdog = (child: ManagedChild): void => {
      if (!child.ready || child.closed || parentShutdownRequested) return;
      if (child.heartbeatTimer !== undefined) {
        options.clock.clearTimeout(child.heartbeatTimer);
      }
      child.heartbeatTimer = options.clock.setTimeout(() => {
        child.heartbeatTimer = undefined;
        if (child.closed || parentShutdownRequested) return;
        options.reportIncident({
          type: "git-broker-heartbeat-timeout",
          missedBeats: MISSED_BROKER_HEARTBEATS_BEFORE_TERMINATION,
          intervalMs: options.brokerHeartbeatIntervalMs,
        });
        failBroker("Brain git broker stopped reporting activity");
      }, options.brokerHeartbeatIntervalMs * MISSED_BROKER_HEARTBEATS_BEFORE_TERMINATION);
    };

    const observeBrokerProgress = (
      child: ManagedChild,
      beat: Heartbeat,
    ): void => {
      if (beat.oldestActiveProgressAt === null) return;
      const staleMs = options.clock.now() - beat.oldestActiveProgressAt;
      if (staleMs < options.brokerProgressTimeoutMs) return;
      // The broker itself is answering; the Git child underneath it is not.
      options.reportIncident({
        type: "git-broker-progress-stale",
        activeRequestIds: beat.activeRequestIds,
        staleMs,
        timeoutMs: options.brokerProgressTimeoutMs,
      });
      failBroker("Brain git broker stopped making progress");
      void child;
    };

    /**
     * A lost owner is terminal until group absence can be proven. Signalling
     * the group is the first half of that proof; the probe that establishes it
     * is what a replacement will need before it may start.
     */
    /**
     * A stalled owner is terminated, not disowned.
     *
     * Signalling the group starts the same proof an exited broker needs: the
     * replacement waits on `replaceBrokerWhenGroupIsGone`, driven by the close
     * this signal produces.
     */
    const failBroker = (message: string): void => {
      void message;
      signalChild(broker, "SIGTERM");
      if (broker) brokerTerminationDeadline(broker);
    };

    /** Escalate once, so a group that ignores SIGTERM still stops. */
    const brokerTerminationDeadline = (child: ManagedChild): void => {
      if (child.heartbeatTimer !== undefined) {
        options.clock.clearTimeout(child.heartbeatTimer);
        child.heartbeatTimer = undefined;
      }
      options.clock.setTimeout(() => {
        signalChild(child, "SIGKILL");
      }, options.shutdownGraceMs);
    };

    /**
     * Is every member of the old owner's group gone?
     *
     * Signal 0 delivers nothing and only reports reachability, so ESRCH is the
     * evidence. Anything else — still reachable, or an error that does not say
     * "gone" — is not proof, and the absence of proof is what forbids a
     * replacement rather than merely delaying one.
     */
    const groupIsAbsent = (pid: number): boolean => {
      try {
        options.processImpl.kill(-pid, 0);
        return false;
      } catch (error) {
        return isNoSuchProcess(error);
      }
    };

    /**
     * Replace the owner only after proving the old group absent.
     *
     * A surviving Git child of the old broker can still be writing to the
     * checkout. Starting a second owner beside it would put two writers on one
     * repository, which is the failure this whole design exists to remove — so
     * unproven absence fails the entire runtime for external cleanup instead.
     */
    const replaceBrokerWhenGroupIsGone = (pid: number, attempt = 1): void => {
      if (settled || parentShutdownRequested || finalResult) return;

      if (groupIsAbsent(pid)) {
        options.reportIncident({
          type: "git-broker-group-absent",
          attempts: attempt,
        });
        broker = undefined;
        spawnChild("git-broker");
        return;
      }

      if (attempt >= options.brokerGroupProbeAttempts) {
        options.reportIncident({
          type: "git-broker-group-absence-unproven",
          attempts: attempt,
        });
        finalResult ??= {
          success: false,
          message:
            "Brain git broker process group could not be proven gone; the runtime is exiting for external cleanup",
          exitCode: 1,
        };
        stopEverything();
        maybeFinish();
        return;
      }

      options.clock.setTimeout(() => {
        replaceBrokerWhenGroupIsGone(pid, attempt + 1);
      }, options.brokerGroupProbeIntervalMs);
    };

    const maybeFinish = (): void => {
      if (activeChildren().length > 0) return;
      if (finalResult) {
        finish(finalResult);
      } else if (parentShutdownRequested) {
        finish({ success: true });
      }
    };

    /**
     * Stop the roles, and only then the owner they were using.
     *
     * Signalling in order is not enough: a role that has been signalled can
     * still be finishing a Git request, and taking the socket away then is
     * exactly the loss the ordering exists to prevent. So the broker is
     * signalled once web and worker have actually exited — or once the grace
     * deadline says a role is never going to.
     */
    const requestChildrenShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      shutdownSignal = signal;
      signalChild(worker, signal);
      signalChild(web, signal);
      stopBrokerWhenRolesAreGone();
      forceKillTimer ??= options.clock.setTimeout(() => {
        signalChild(worker, "SIGKILL");
        signalChild(web, "SIGKILL");
        // Waiting on a role that will not exit would keep the whole runtime
        // up forever, so the owner stops regardless at this point.
        signalChild(broker, signal);
        signalChild(broker, "SIGKILL");
      }, options.shutdownGraceMs);
    };

    const stopBrokerWhenRolesAreGone = (): void => {
      if (shutdownSignal === undefined) return;
      const roles = [web, worker].filter(
        (child): child is ManagedChild => child !== undefined && !child.closed,
      );
      if (roles.length > 0) return;
      signalChild(broker, shutdownSignal);
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

      // A role exiting may be the last thing the owner was waiting for.
      if (child.role !== "git-broker") stopBrokerWhenRolesAreGone();

      if (child.role === "git-broker") {
        if (!parentShutdownRequested && !finalResult) {
          options.reportIncident({
            type: "git-broker-exited",
            code,
            signal,
            ready: child.ready,
          });
        }
        // A broker that never became ready has nothing to replace: the roles
        // that need it were never started, and the runtime is misassembled.
        const pid = child.process.pid;
        if (
          !parentShutdownRequested &&
          child.ready &&
          pid !== undefined &&
          !finalResult
        ) {
          replaceBrokerWhenGroupIsGone(pid);
          return;
        }
        if (!parentShutdownRequested) {
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
          armBrokerWatchdog(child);
          // Only now may a Git-capable role start: there is no app-process
          // fallback for it to fall back to. A replacement owner does not
          // restart the roles that outlived the one it replaced — leaving them
          // running is the whole point of a proven-safe replacement.
          if (web === undefined) spawnChild("web");
          return;
        }
        if (role === "git-broker" && child.ready) {
          const beat = readHeartbeat(message);
          if (beat) {
            armBrokerWatchdog(child);
            observeBrokerProgress(child, beat);
          }
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
    brokerHeartbeatIntervalMs:
      dependencies.brokerHeartbeatIntervalMs ?? BROKER_HEARTBEAT_INTERVAL_MS,
    brokerProgressTimeoutMs:
      dependencies.brokerProgressTimeoutMs ?? BROKER_PROGRESS_TIMEOUT_MS,
    brokerGroupProbeIntervalMs:
      dependencies.brokerGroupProbeIntervalMs ?? BROKER_GROUP_PROBE_INTERVAL_MS,
    brokerGroupProbeAttempts:
      dependencies.brokerGroupProbeAttempts ?? BROKER_GROUP_PROBE_ATTEMPTS,
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
