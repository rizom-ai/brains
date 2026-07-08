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

export function resolveStandardPaths(
  env: NodeJS.ProcessEnv = process.env,
): StandardPaths {
  return {
    dataDir: env["XDG_DATA_HOME"] ?? "./data",
    cacheDir: env["XDG_CACHE_HOME"] ?? "./cache",
    distDir: "./dist",
  };
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
        : `Cannot create data directories: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(msg, { cause: error });
  }

  return createStandardConfig(paths);
}
