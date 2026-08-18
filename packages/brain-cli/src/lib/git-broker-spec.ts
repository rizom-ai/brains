import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "path";
import { z } from "@brains/utils/zod";
import {
  gitBrokerSocketPath,
  resolveCheckoutPath,
} from "@brains/directory-sync";
import type { GitBrokerSpec } from "./process-supervisor";
import type { BrainYamlConfig } from "./brain-yaml";

/**
 * Whether this Brain has a checkout to own, and where its owner listens.
 *
 * The supervisor decides this before booting anything, because a Brain with
 * Git configured must not start a Git-capable role until the broker is ready,
 * and a Brain without Git must acquire no broker at all.
 */

/**
 * The shell's own default, pinned in `test/git-broker-spec.test.ts`. The
 * broker child and the app roles resolve the checkout in separate processes,
 * so this assumption is shared rather than guessed twice.
 */
export const BRAIN_DEFAULT_DATA_DIR = "./brain-data";

/** Instance-owned, never inside a checkout Git can rewrite. */
const RUNTIME_DIR_NAME = ".brain-runtime";

/** Prefer the broker-only bundle/source beside a Brain entrypoint. */
export function resolveGitBrokerEntrypointPath(
  brainEntrypointPath: string,
): string | undefined {
  const directory = dirname(brainEntrypointPath);
  for (const filename of ["git-broker.js", "git-broker-entrypoint.ts"]) {
    const candidate = join(directory, filename);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Only what this decision needs. Non-strict on purpose: the rest of the
 * plugin's configuration is the plugin's business, and the broker child parses
 * it in full with the plugin's own schema.
 */
const brokerRelevantConfigSchema = z.object({
  syncPath: z.string().optional(),
  git: z
    .object({
      repo: z.string().optional(),
      gitUrl: z.string().optional(),
    })
    .optional(),
});

export function resolveGitBrokerSpec(
  cwd: string,
  config: BrainYamlConfig,
): GitBrokerSpec | undefined {
  const pluginConfig = brokerRelevantConfigSchema.parse(
    config.plugins?.["directory-sync"] ?? {},
  );
  const git = pluginConfig.git;
  if (git?.repo === undefined && git?.gitUrl === undefined) return undefined;

  const runtimeDir = join(cwd, RUNTIME_DIR_NAME);
  const checkoutPath = resolveCheckoutPath({
    cwd,
    dataDir: BRAIN_DEFAULT_DATA_DIR,
    ...(pluginConfig.syncPath === undefined
      ? {}
      : { syncPath: pluginConfig.syncPath }),
  });

  // A socket inside the checkout is a file Git can stage, and a clone or reset
  // could remove the ownership boundary itself.
  const inside = relative(resolve(checkoutPath), runtimeDir);
  if (!inside.startsWith("..")) {
    throw new Error(
      `Git sync checkout ${checkoutPath} would contain the Brain runtime directory; configure a syncPath outside the instance root`,
    );
  }

  return {
    socketPath: gitBrokerSocketPath(runtimeDir),
    checkoutPath,
  };
}
