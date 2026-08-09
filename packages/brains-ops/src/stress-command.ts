import { spawn } from "node:child_process";

export interface StressCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

export interface StressCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type StressCommandRunner = (
  command: string,
  args: readonly string[],
  options?: StressCommandOptions,
) => Promise<StressCommandResult>;

export const runStressCommand: StressCommandRunner = async (
  command,
  args,
  options = {},
) =>
  new Promise<StressCommandResult>((resolveCommand, rejectCommand) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", rejectCommand);
    child.on("close", (exitCode) => {
      resolveCommand({ exitCode: exitCode ?? 1, stdout, stderr });
    });
    child.stdin.end(options.stdin);
  });

export async function requireCommand(
  runner: StressCommandRunner,
  command: string,
  args: readonly string[],
  options?: StressCommandOptions,
): Promise<StressCommandResult> {
  const result = await runner(command, args, options);
  if (result.exitCode !== 0) {
    throw commandError(command, args, result);
  }
  return result;
}

export function commandError(
  command: string,
  args: readonly string[],
  result: StressCommandResult,
): Error {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new Error(
    `${command} ${args.join(" ")} exited with ${result.exitCode}${detail ? `: ${detail}` : ""}`,
  );
}
