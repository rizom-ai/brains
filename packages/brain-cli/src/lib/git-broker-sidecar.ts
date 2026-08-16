import {
  GIT_BROKER_SOCKET_ENV,
  startGitBrokerHost,
} from "@brains/directory-sync";
import { Logger } from "@brains/utils/logger";
import type { BrainYamlConfig } from "./brain-yaml";
import {
  BRAIN_DEFAULT_DATA_DIR,
  resolveGitBrokerSpec,
} from "./git-broker-spec";

/**
 * An owner for the starts that are not the supervised one.
 *
 * Production boots through `superviseRuntimeChildren`, which runs the broker
 * as its own process. Monorepo development, `--chat` and `--startup-check`
 * boot in place — and with Git configured they were booting with no owner at
 * all, so the plugin failed during registration for want of a socket.
 *
 * Here the broker is hosted in this process rather than supervised as a child.
 * That is deliberate and limited: these paths have no supervisor to prove a
 * process group absent, and a developer's terminal is the thing that owns
 * their lifetime. What matters for correctness is that there is exactly one
 * owner, and there is.
 */
export async function withGitBrokerSidecar<T>(
  cwd: string,
  config: BrainYamlConfig,
  run: () => Promise<T>,
): Promise<T> {
  const spec = resolveGitBrokerSpec(cwd, config);
  if (!spec) return run();

  const broker = await startGitBrokerHost({
    socketPath: spec.socketPath,
    cwd,
    dataDir: BRAIN_DEFAULT_DATA_DIR,
    pluginConfig: config.plugins?.["directory-sync"] ?? {},
    logger: Logger.getInstance(),
  });

  // The same handoff the supervisor makes to a child it spawned; here the
  // process being told is this one.
  const previous = process.env[GIT_BROKER_SOCKET_ENV];
  process.env[GIT_BROKER_SOCKET_ENV] = broker.socketPath;

  try {
    return await run();
  } finally {
    // Restored whatever happened: a leaked variable would point the next run
    // at a socket nobody is listening on, and a leaked owner would hold it.
    if (previous === undefined) {
      delete process.env[GIT_BROKER_SOCKET_ENV];
    } else {
      process.env[GIT_BROKER_SOCKET_ENV] = previous;
    }
    await broker.stop();
  }
}
