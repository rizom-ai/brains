import { spawn } from "node:child_process";

export type RunCommand = (
  command: string,
  args: string[],
  options?: { stdin?: string; env?: NodeJS.ProcessEnv },
) => Promise<void>;

export const runSubprocess: RunCommand = async (command, args, options = {}) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "inherit", "inherit"],
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`),
      );
    });

    if (options.stdin) {
      proc.stdin.end(options.stdin);
    } else {
      proc.stdin.end();
    }
  });
