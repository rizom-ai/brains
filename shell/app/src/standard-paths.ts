/**
 * Standard Storage Paths (app/deploy layer)
 *
 * The one place environment policy turns into explicit storage config.
 * Deployed containers set `XDG_DATA_HOME=/data` (persisted volume) and
 * `XDG_CACHE_HOME`; this module reads them and hands `@brains/core`
 * concrete paths — core itself never touches the environment.
 */

import { mkdir } from "fs/promises";
import {
  createStandardConfig,
  type StandardConfig,
  type StandardPaths,
} from "@brains/core";
import { getErrorMessage } from "@brains/utils/error";

export function resolveStandardPaths(
  env: NodeJS.ProcessEnv = process.env,
): StandardPaths {
  return {
    dataDir: env["XDG_DATA_HOME"] ?? "./data",
    cacheDir: env["XDG_CACHE_HOME"] ?? "./cache",
    distDir: "./dist",
  };
}

/**
 * Where this role's Git checkout owner listens.
 *
 * A runtime handoff from the supervisor, not a preference: it is absent from
 * `brain.yaml` on purpose, because two roles pointed at different sockets
 * means either two owners or none. Resolved here for the same reason the
 * storage paths are — environment policy belongs to this layer, and nothing
 * downstream should have to read the environment to find it.
 */
export function resolveGitBrokerSocket(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const socketPath = env["BRAIN_GIT_BROKER_SOCKET"];
  if (!socketPath) return undefined;

  // A unix socket address is bounded, and the kernel truncates rather than
  // refusing. Truncation would leave roles bound to different paths, which is
  // precisely two owners, so this fails at boot instead.
  const MAX_UNIX_SOCKET_PATH = 107;
  if (Buffer.byteLength(socketPath) > MAX_UNIX_SOCKET_PATH) {
    throw new Error(
      `Git broker socket path is too long for a unix socket (${Buffer.byteLength(socketPath)} > ${MAX_UNIX_SOCKET_PATH} bytes): ${socketPath}`,
    );
  }
  return socketPath;
}

export function resolveStandardConfig(
  env: NodeJS.ProcessEnv = process.env,
): StandardConfig {
  return createStandardConfig(resolveStandardPaths(env));
}

export async function resolveStandardConfigWithDirectories(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StandardConfig> {
  const paths = resolveStandardPaths(env);
  try {
    await mkdir(paths.dataDir, { recursive: true });
    await mkdir(paths.cacheDir, { recursive: true });
    await mkdir(paths.distDir, { recursive: true });
  } catch (error) {
    const msg =
      error instanceof Error && error.message.includes("EACCES")
        ? `Cannot create data directories — permission denied. Run from a writable directory or check permissions on ${paths.dataDir}`
        : `Cannot create data directories: ${getErrorMessage(error)}`;
    throw new Error(msg, { cause: error });
  }

  return createStandardConfig(paths);
}
