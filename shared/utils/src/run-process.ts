/**
 * Spawn a process and wait for it.
 *
 * The awaited counterpart to `execSync`/`execFileSync`/`spawnSync`, which
 * tests must not use. A synchronous spawn has to collect its child's exit
 * itself, and under `bun test --parallel` that has been observed failing: a
 * worker spinning at 100% CPU for over an hour with its child left
 * `<defunct>`. No per-test timeout can interrupt it, because the loop never
 * yields, and it takes the whole run down with it — a child that inherits
 * stdio holds the pipe the runner waits on for EOF.
 *
 * Awaiting `child.exited` is what collects the exit, so it always happens
 * here.
 */
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunProcessOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Written to the child's stdin, which is then closed. */
  stdin?: string;
}

/** Run `command`, waiting for it. Non-zero exit is returned, not thrown. */
export async function runProcess(
  command: readonly string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  const [executable] = command;
  if (executable === undefined) {
    throw new Error("runProcess needs a command to run");
  }
  const child = Bun.spawn([...command], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.stdin === undefined
      ? {}
      : { stdin: Buffer.from(options.stdin) }),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/**
 * Run `command` and return its stdout, throwing if it fails.
 *
 * The error carries stderr, so a failure says what went wrong rather than
 * only that something did.
 */
export async function runProcessOrThrow(
  command: readonly string[],
  options: RunProcessOptions = {},
): Promise<string> {
  const result = await runProcess(command, options);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `${command.join(" ")} exited with ${result.exitCode}${detail ? `: ${detail}` : ""}`,
    );
  }
  return result.stdout;
}
