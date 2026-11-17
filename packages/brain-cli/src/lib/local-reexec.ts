import { existsSync, realpathSync } from "fs";
import { join } from "path";
import { printCommandResult } from "./print-command-result";
import {
  runtimeSignalProcess,
  spawnBunRunner,
  type SpawnBunRunnerDependencies,
} from "./spawn-bun-runner";

const LOCAL_BRAIN_PATH = join(
  "node_modules",
  "@rizom",
  "brain",
  "dist",
  "brain.js",
);

/**
 * Set on the process a hand-off starts. The local install it starts may be a
 * release that still compared against the build machine's path and handed
 * every invocation off again; this stops it there.
 */
export const SKIP_LOCAL_REEXEC_ENV = "BRAIN_SKIP_LOCAL_REEXEC";

/**
 * Check if a local @rizom/brain installation exists.
 * Returns the path to the local brain.js, or undefined.
 */
export function findLocalBrain(cwd: string): string | undefined {
  const localPath = join(cwd, LOCAL_BRAIN_PATH);
  return existsSync(localPath) ? localPath : undefined;
}

/** The file behind a path, through any links; the path when it has none. */
function resolvedPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * The local install this invocation belongs to, or undefined when this
 * process already is it, there is none, or a hand-off already happened.
 *
 * `self` is the script Bun was started with. It is compared through links
 * because `bun run brain` reaches the install through `node_modules/.bin`.
 * The module's own `__filename` cannot stand in for it: the bundler inlines
 * it as the build machine's source path.
 */
export function localBrainToReexec(
  cwd: string,
  self: string = Bun.main,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env[SKIP_LOCAL_REEXEC_ENV]) return undefined;
  const localBrain = findLocalBrain(cwd);
  if (!localBrain) return undefined;
  return resolvedPath(localBrain) === resolvedPath(self)
    ? undefined
    : localBrain;
}

export interface ReexecLocalBrainOptions extends SpawnBunRunnerDependencies {
  cwd: string;
  args: string[];
  /** The script this process runs; Bun's entry script when omitted. */
  self?: string;
}

/**
 * Local over global: hand the invocation to `./node_modules/@rizom/brain`
 * when that is not this process, and return its exit status. Undefined means
 * this process runs the command itself.
 *
 * The local brain runs as a child that SIGINT and SIGTERM are forwarded to,
 * so a stop request reaches the process that owns the shutdown instead of
 * ending this one and leaving the child to be killed.
 */
export async function reexecLocalBrain(
  options: ReexecLocalBrainOptions,
): Promise<number | undefined> {
  const processImpl = options.processImpl ?? runtimeSignalProcess;
  const localBrain = localBrainToReexec(
    options.cwd,
    options.self,
    processImpl.env,
  );
  if (!localBrain) return undefined;

  // The local brain prints its own failures; only its status is passed on.
  const result = await spawnBunRunner({
    cwd: options.cwd,
    args: [localBrain, ...options.args],
    env: { ...processImpl.env, [SKIP_LOCAL_REEXEC_ENV]: "1" },
    ...(options.spawnImpl && { spawnImpl: options.spawnImpl }),
    processImpl,
  });
  return printCommandResult(result);
}
