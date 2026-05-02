import { spawn, type ChildProcess, type SpawnOptions } from "child_process";
import type { CommandResult } from "../run-command";

export type SpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export interface SpawnBunRunnerDependencies {
  spawnImpl?: SpawnImpl;
  processImpl?: Pick<NodeJS.Process, "env" | "on" | "removeListener">;
}

export interface SpawnBunRunnerOptions extends SpawnBunRunnerDependencies {
  cwd: string;
  args: string[];
  failureMessage: (code: number | null) => string;
}

export function spawnBunRunner(
  options: SpawnBunRunnerOptions,
): Promise<CommandResult> {
  const spawnImpl = options.spawnImpl ?? spawn;
  const processImpl = options.processImpl ?? process;

  return new Promise((resolve) => {
    const proc = spawnImpl("bun", options.args, {
      cwd: options.cwd,
      stdio: "inherit",
      env: processImpl.env,
    });

    let settled = false;
    const cleanup = (): void => {
      processImpl.removeListener("SIGINT", handleSigint);
      processImpl.removeListener("SIGTERM", handleSigterm);
      processImpl.removeListener("exit", handleExit);
    };
    const finish = (result: CommandResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };
    const forwardSignal = (signal: NodeJS.Signals): void => {
      const child = proc as ChildProcess;
      if (child.exitCode !== null || child.killed) {
        return;
      }
      try {
        child.kill(signal);
      } catch {
        // Ignore races where the child exits between the status check and kill.
      }
    };

    const handleSigint = (): void => forwardSignal("SIGINT");
    const handleSigterm = (): void => forwardSignal("SIGTERM");
    const handleExit = (): void => forwardSignal("SIGTERM");

    processImpl.on("SIGINT", handleSigint);
    processImpl.on("SIGTERM", handleSigterm);
    processImpl.on("exit", handleExit);

    proc.on("error", (error) => {
      finish({
        success: false,
        message: `Failed to spawn bun: ${error.message}`,
      });
    });

    proc.on("close", (code, signal) => {
      if (signal === "SIGINT" || signal === "SIGTERM") {
        finish({ success: true });
        return;
      }

      finish({
        success: code === 0,
        ...(code !== 0 ? { message: options.failureMessage(code) } : {}),
      });
    });
  });
}
