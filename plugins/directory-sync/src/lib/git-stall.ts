import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

/** Identifies the baseDir + stall timeout for a network git operation. */
export interface GitNetwork {
  baseDir: string;
  timeoutMs: number;
}

/** Thrown when a git network operation produces no output for too long. */
export class GitStallError extends Error {
  constructor(stallMs: number) {
    super(`Git operation stalled: no output for ${stallMs}ms`);
    this.name = "GitStallError";
  }
}

/**
 * Run a single network git operation on a throwaway simple-git instance,
 * rejecting with GitStallError if git produces no output for `timeoutMs`.
 *
 * Why not rely on simple-git's own `timeout.block`: simple-git only settles a
 * task once the child's stdio fully closes. A hung remote keeps the inherited
 * pipes open through a transport grandchild, so the SIGINT from `timeout.block`
 * never lets the promise resolve — it would wedge the git lock indefinitely.
 * We instead watch the output streams directly and reject as soon as they go
 * quiet, abort the child best-effort, and discard the instance so a leaked
 * process can't block subsequent operations or hold the lock open.
 *
 * The timer resets on every chunk of git output, so a slow-but-progressing
 * transfer is never killed — only a genuinely stalled one.
 */
export async function runGitWithStallTimeout<T>(
  net: GitNetwork,
  run: (git: SimpleGit) => Promise<T>,
): Promise<T> {
  const { baseDir, timeoutMs } = net;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onStall = (): void => {};

  const armStall = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onStall(), timeoutMs);
  };

  const git = simpleGit(baseDir, {
    abort: controller.signal,
    timeout: { block: timeoutMs },
  }).outputHandler((_command, stdout, stderr) => {
    stdout.on("data", armStall);
    stderr.on("data", armStall);
  });

  const stalled = new Promise<never>((_resolve, reject) => {
    onStall = (): void => {
      controller.abort();
      reject(new GitStallError(timeoutMs));
    };
  });

  armStall();
  try {
    return await Promise.race([run(git), stalled]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
