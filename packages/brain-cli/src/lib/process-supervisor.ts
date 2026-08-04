import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { CommandResult } from "./command-result";
import type {
  SignalProcess,
  SpawnBunRunnerDependencies,
  SpawnImpl,
} from "./spawn-bun-runner";

export type BrainChildRole = "web" | "worker";

export interface SupervisorClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ProcessSupervisorDependencies extends SpawnBunRunnerDependencies {
  argv?: readonly string[];
  entrypointPath?: string;
  clock?: SupervisorClock;
  startupTimeoutMs?: number;
  shutdownGraceMs?: number;
}

const defaultClock: SupervisorClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
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

function isRuntimeReadyMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "runtime-ready"
  );
}

interface WebSupervisorOptions {
  cwd: string;
  entrypointPath: string;
  spawnImpl: SpawnImpl;
  processImpl: SignalProcess;
  clock: SupervisorClock;
  startupTimeoutMs: number;
  shutdownGraceMs: number;
}

function runWebSupervisor(
  options: WebSupervisorOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = options.spawnImpl(
      "bun",
      [options.entrypointPath, "start", "--child=web"],
      {
        cwd: options.cwd,
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: options.processImpl.env,
      } satisfies SpawnOptions,
    );

    let settled = false;
    let runtimeReady = false;
    let startupTimedOut = false;
    let parentShutdownRequested = false;
    let forceKillTimer: unknown;
    const cleanup = (): void => {
      options.processImpl.removeListener("SIGINT", handleSigint);
      options.processImpl.removeListener("SIGTERM", handleSigterm);
      options.processImpl.removeListener("exit", handleExit);
      child.removeListener("message", handleMessage);
      options.clock.clearTimeout(startupTimer);
      if (forceKillTimer !== undefined) {
        options.clock.clearTimeout(forceKillTimer);
      }
    };
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const forwardSignal = (signal: NodeJS.Signals): void => {
      const activeChild = child as ChildProcess;
      if (activeChild.exitCode !== null) return;
      try {
        activeChild.kill(signal);
      } catch {
        // The child won the race and has already exited.
      }
    };
    const requestShutdown = (signal: "SIGINT" | "SIGTERM"): void => {
      parentShutdownRequested = true;
      forwardSignal(signal);
      forceKillTimer ??= options.clock.setTimeout(() => {
        forwardSignal("SIGKILL");
      }, options.shutdownGraceMs);
    };
    const handleSigint = (): void => requestShutdown("SIGINT");
    const handleSigterm = (): void => requestShutdown("SIGTERM");
    const handleExit = (): void => requestShutdown("SIGTERM");
    const handleMessage = (message: unknown): void => {
      if (!isRuntimeReadyMessage(message)) return;
      runtimeReady = true;
      options.clock.clearTimeout(startupTimer);
    };
    const startupTimer = options.clock.setTimeout(() => {
      if (runtimeReady || settled) return;
      startupTimedOut = true;
      requestShutdown("SIGTERM");
    }, options.startupTimeoutMs);

    options.processImpl.on("SIGINT", handleSigint);
    options.processImpl.on("SIGTERM", handleSigterm);
    options.processImpl.on("exit", handleExit);
    child.on("message", handleMessage);
    child.on("error", (error) => {
      finish({
        success: false,
        message: `Failed to spawn Brain web child: ${error.message}`,
        exitCode: 1,
      });
    });
    child.on("close", (code, signal) => {
      if (startupTimedOut) {
        finish({
          success: false,
          message: "Brain web child missed its runtime-ready deadline",
          exitCode: 1,
        });
        return;
      }
      if (
        parentShutdownRequested &&
        (signal === "SIGINT" || signal === "SIGTERM" || signal === "SIGKILL")
      ) {
        finish({ success: true });
        return;
      }
      if (!runtimeReady) {
        finish({
          success: false,
          message: "Brain web child exited before runtime-ready",
          exitCode: code ?? 1,
        });
        return;
      }
      if (signal === "SIGINT" || signal === "SIGTERM") {
        finish({ success: true });
        return;
      }
      finish({
        success: code === 0,
        ...(code !== 0
          ? {
              message: `Brain web child exited with code ${code}`,
              exitCode: code ?? 1,
            }
          : {}),
      });
    });
  });
}

/** S2 supervisor: own one runtime-ready web child after parent migrations. */
export function superviseWebChild(
  cwd: string,
  entrypointPath: string,
  dependencies: ProcessSupervisorDependencies = {},
): Promise<CommandResult> {
  return runWebSupervisor({
    cwd,
    entrypointPath,
    spawnImpl: dependencies.spawnImpl ?? spawn,
    processImpl: dependencies.processImpl ?? process,
    clock: dependencies.clock ?? defaultClock,
    startupTimeoutMs: dependencies.startupTimeoutMs ?? 30_000,
    shutdownGraceMs: dependencies.shutdownGraceMs ?? 15_000,
  });
}
