import { spawn, type SpawnOptions } from "node:child_process";
import {
  GIT_BROKER_CHECKOUT_ENV,
  GIT_BROKER_SOCKET_ENV,
} from "@brains/directory-sync";
import type { BrainYamlConfig } from "./brain-yaml";
import {
  resolveGitBrokerEntrypointPath,
  resolveGitBrokerSpec,
} from "./git-broker-spec";
import type {
  SignalProcess,
  SpawnedProcess,
  SpawnImpl,
} from "./spawn-bun-runner";

function restoreEnvironment(
  env: NodeJS.ProcessEnv,
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) delete env[name];
  else env[name] = value;
}

/**
 * A separate checkout owner for starts that do not use the full supervisor.
 *
 * Development, chat, and startup-check still need the same process boundary as
 * production. Hosting `simple-git` in the app process would make that process
 * both client and owner, recreating the completion/lifetime coupling the
 * broker exists to remove. These paths therefore start the ordinary
 * `--child=git-broker` role and own its complete process-group lifetime.
 */

export interface GitBrokerSidecarDependencies {
  spawnImpl?: SpawnImpl | undefined;
  processImpl?: SignalProcess | undefined;
  entrypointPath?: string | undefined;
  startupTimeoutMs?: number | undefined;
  shutdownGraceMs?: number | undefined;
  groupProbeAttempts?: number | undefined;
  groupProbeIntervalMs?: number | undefined;
}

interface RunningSidecar {
  child: SpawnedProcess;
  closed: Promise<void>;
  isClosed(): boolean;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 15_000;
const DEFAULT_GROUP_PROBE_ATTEMPTS = 20;
const DEFAULT_GROUP_PROBE_INTERVAL_MS = 50;

function isNoSuchProcess(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupIsAbsent(processImpl: SignalProcess, pid: number): boolean {
  try {
    processImpl.kill(-pid, 0);
    return false;
  } catch (error) {
    return isNoSuchProcess(error);
  }
}

async function waitForGroupAbsence(
  processImpl: SignalProcess,
  pid: number,
  attempts: number,
  intervalMs: number,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (groupIsAbsent(processImpl, pid)) return true;
    if (attempt < attempts) await delay(intervalMs);
  }
  return false;
}

function spawnSidecar(
  cwd: string,
  socketPath: string,
  dependencies: GitBrokerSidecarDependencies,
): RunningSidecar {
  const spawnImpl = dependencies.spawnImpl ?? spawn;
  const processImpl = dependencies.processImpl ?? process;
  const entrypointPath = dependencies.entrypointPath ?? process.argv[1];
  if (!entrypointPath) {
    throw new Error("Cannot start Git broker child without a Brain entrypoint");
  }

  const brokerEntrypoint = resolveGitBrokerEntrypointPath(entrypointPath);
  const child = spawnImpl(
    "bun",
    brokerEntrypoint
      ? [brokerEntrypoint]
      : [entrypointPath, "start", "--child=git-broker"],
    {
      cwd,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      detached: true,
      env: {
        ...processImpl.env,
        [GIT_BROKER_SOCKET_ENV]: socketPath,
      },
    } satisfies SpawnOptions,
  );
  const settled = Promise.withResolvers<void>();
  let closed = false;
  child.on("close", () => {
    if (closed) return;
    closed = true;
    settled.resolve();
  });
  child.on("error", (error) => {
    if (closed) return;
    closed = true;
    settled.reject(error);
  });
  return { child, closed: settled.promise, isClosed: () => closed };
}

async function waitUntilReady(
  sidecar: RunningSidecar,
  timeoutMs: number,
): Promise<void> {
  const ready = Promise.withResolvers<void>();
  let reportedReady = false;
  sidecar.child.on("message", (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "broker-ready"
    ) {
      reportedReady = true;
      ready.resolve();
    }
  });
  sidecar.closed.then(
    () => {
      if (!reportedReady) {
        ready.reject(new Error("Git broker child exited before ready"));
      }
    },
    (error: unknown) => ready.reject(error),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Git broker child missed its ready deadline")),
      timeoutMs,
    );
  });
  try {
    await Promise.race([ready.promise, timedOut]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function stopSidecar(
  sidecar: RunningSidecar,
  dependencies: GitBrokerSidecarDependencies,
): Promise<void> {
  const processImpl = dependencies.processImpl ?? process;
  const pid = sidecar.child.pid;

  if (!sidecar.isClosed()) sidecar.child.kill("SIGTERM");
  const closedGracefully = await Promise.race([
    sidecar.closed.then(
      () => true,
      () => true,
    ),
    delay(dependencies.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS).then(
      () => false,
    ),
  ]);

  if (pid === undefined) {
    if (!closedGracefully) {
      sidecar.child.kill("SIGKILL");
      await sidecar.closed;
    }
    return;
  }

  // A leader that closes cleanly can still leave a Git descendant in its
  // detached process group. Probe once before escalation, but do not mistake
  // the leader's close event for proof that the complete group is absent.
  if (closedGracefully && groupIsAbsent(processImpl, pid)) return;

  try {
    processImpl.kill(-pid, "SIGKILL");
  } catch (error) {
    // The group can finish between the grace race and escalation. ESRCH is
    // already the absence fact the following probe needs; other failures
    // remain terminal because they do not prove the group is gone.
    if (!isNoSuchProcess(error)) throw error;
  }

  if (
    await waitForGroupAbsence(
      processImpl,
      pid,
      dependencies.groupProbeAttempts ?? DEFAULT_GROUP_PROBE_ATTEMPTS,
      dependencies.groupProbeIntervalMs ?? DEFAULT_GROUP_PROBE_INTERVAL_MS,
    )
  ) {
    return;
  }

  // The leader's close is not proof that a Git descendant is gone. A process
  // group whose absence cannot be established is left for external cleanup;
  // the app path fails rather than silently disowning it.
  throw new Error(
    "Git broker child process group could not be proven gone; external cleanup is required",
  );
}

export async function withGitBrokerSidecar<T>(
  cwd: string,
  config: BrainYamlConfig,
  run: () => Promise<T>,
  dependencies: GitBrokerSidecarDependencies = {},
): Promise<T> {
  const spec = resolveGitBrokerSpec(cwd, config);
  if (!spec) return run();

  const sidecar = spawnSidecar(cwd, spec.socketPath, dependencies);
  try {
    await waitUntilReady(
      sidecar,
      dependencies.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    );
  } catch (error) {
    await stopSidecar(sidecar, dependencies);
    throw error;
  }

  // The same checkout handoff the full supervisor makes to app roles.
  const processImpl = dependencies.processImpl ?? process;
  const previousSocket = processImpl.env[GIT_BROKER_SOCKET_ENV];
  const previousCheckout = processImpl.env[GIT_BROKER_CHECKOUT_ENV];
  processImpl.env[GIT_BROKER_SOCKET_ENV] = spec.socketPath;
  processImpl.env[GIT_BROKER_CHECKOUT_ENV] = spec.checkoutPath;

  try {
    return await run();
  } finally {
    // Leaked variables would point the next run at an owner or checkout that
    // no longer belongs to it.
    restoreEnvironment(processImpl.env, GIT_BROKER_SOCKET_ENV, previousSocket);
    restoreEnvironment(
      processImpl.env,
      GIT_BROKER_CHECKOUT_ENV,
      previousCheckout,
    );
    await stopSidecar(sidecar, dependencies);
  }
}
