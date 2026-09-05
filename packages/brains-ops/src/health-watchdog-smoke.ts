import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  BRAIN_WATCHDOG_LABEL_FILTER,
  healthWatchdogScript,
} from "@brains/deploy-support/health-watchdog";
import type { FetchLike } from "@brains/utils/fetch-like";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

import remoteSmokeTemplate from "./health-watchdog-smoke-remote.sh" with { type: "text" };
import { loadPilotRegistry, type ResolvedUser } from "./load-registry";
import type { PilotConfig } from "./schema";
import {
  commandError,
  runStressCommand,
  type StressCommandResult,
  type StressCommandRunner,
} from "./stress-command";

const requiredEnvironmentSchema = z.object({
  HCLOUD_TOKEN: z.string().min(1),
  KAMAL_SSH_PRIVATE_KEY: z.string().min(1),
});

const hetznerServersSchema = z.object({
  servers: z.array(
    z.object({
      status: z.string(),
      public_net: z.object({
        ipv4: z.object({ ip: z.string().min(1) }),
      }),
    }),
  ),
});

export interface HealthWatchdogSmokeTarget {
  handle: string;
  domain: string;
  confirmation: string;
  runId: string;
}

export interface HealthWatchdogSmokeOptions {
  rootDir: string;
  handle: string;
  confirmation: string;
  runId: string;
  artifactsDir?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: FetchLike | undefined;
  commandRunner?: StressCommandRunner | undefined;
  logger?: ((message: string) => void) | undefined;
}

export interface HealthWatchdogSmokeResult {
  success: true;
  runId: string;
  artifactsDir: string;
  target: {
    handle: string;
    domain: string;
    serverIp: string;
  };
}

export interface CleanupHealthWatchdogSmokeOptions {
  rootDir: string;
  handle: string;
  confirmation: string;
  runId: string;
  artifactsDir?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: FetchLike | undefined;
  commandRunner?: StressCommandRunner | undefined;
  logger?: ((message: string) => void) | undefined;
}

export interface CleanupHealthWatchdogSmokeResult {
  success: true;
  runId: string;
  artifactsDir: string;
  target: {
    handle: string;
    domain: string;
    serverIp: string;
  };
}

interface ResolvedSmokeTarget {
  pilot: PilotConfig;
  user: ResolvedUser;
}

interface SmokeSshContext {
  temporaryRoot: string;
  sshKeyPath: string;
  knownHostsPath: string;
  serverIp: string;
  commandRunner: StressCommandRunner;
}

export function assertHealthWatchdogSmokeTarget(
  target: HealthWatchdogSmokeTarget,
): void {
  const expectedConfirmation = `watchdog-smoke:${target.handle}`;
  if (target.confirmation !== expectedConfirmation) {
    throw new Error(
      `Health watchdog smoke requires --confirm ${expectedConfirmation}`,
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(target.runId)) {
    throw new Error("Health watchdog smoke run ID is invalid");
  }

  const smokeMarker = /(^|[-_.])smoke($|[-_.])/i;
  if (!smokeMarker.test(target.handle) || !smokeMarker.test(target.domain)) {
    throw new Error(
      "Health watchdog smoke is smoke-only; handle and domain must both identify smoke",
    );
  }
}

export function renderHealthWatchdogSmokeRemoteScript(): string {
  return remoteSmokeTemplate
    .replace(
      "__WATCHDOG_PAYLOAD_BASE64__",
      Buffer.from(healthWatchdogScript, "utf8").toString("base64"),
    )
    .replace("__WATCHDOG_LABEL_FILTER__", BRAIN_WATCHDOG_LABEL_FILTER);
}

export async function runHealthWatchdogSmoke(
  options: HealthWatchdogSmokeOptions,
): Promise<HealthWatchdogSmokeResult> {
  const artifactsDir = resolve(
    options.artifactsDir ??
      join(options.rootDir, ".brains-ops", "watchdog-smoke", options.runId),
  );
  const target = await resolveSmokeTarget(options.rootDir, options.handle);
  assertHealthWatchdogSmokeTarget({
    handle: target.user.handle,
    domain: target.user.domain,
    confirmation: options.confirmation,
    runId: options.runId,
  });
  await mkdir(artifactsDir, { recursive: true });

  const environment = requiredEnvironmentSchema.parse(
    options.env ?? process.env,
  );
  const commandRunner = options.commandRunner ?? runStressCommand;
  const logger = options.logger ?? console.info;
  const ssh = await prepareSmokeSsh({
    target,
    environment,
    commandRunner,
    fetchImpl: options.fetchImpl ?? fetch,
  });

  const remoteDir = `/tmp/brains-health-watchdog-smoke-${options.runId}`;
  let failure: Error | undefined;
  let copiedArtifacts = false;
  try {
    const remote = await runRemoteSmoke(ssh, "run", options.runId);
    await writeCommandArtifacts(artifactsDir, "remote", remote);
    if (remote.stdout.trim()) logger(remote.stdout.trim());
    if (remote.exitCode !== 0) {
      failure = commandError("ssh", ["watchdog-smoke", "run"], remote);
    }

    const copy = await copyRemoteArtifacts(ssh, remoteDir, artifactsDir);
    await writeCommandArtifacts(artifactsDir, "scp", copy);
    if (copy.exitCode === 0) {
      copiedArtifacts = await artifactExists(join(artifactsDir, "summary.txt"));
      if (!copiedArtifacts) {
        failure ??= new Error(
          "Health watchdog smoke evidence is missing summary.txt",
        );
      }
    } else {
      failure ??= commandError("scp", [remoteDir, artifactsDir], copy);
    }
  } catch (error) {
    failure = new Error(
      getErrorMessage(error, "Health watchdog smoke execution failed"),
    );
  }

  let cleanupFailure: Error | undefined;
  try {
    const cleanup = await runRemoteSmoke(ssh, "cleanup", options.runId);
    await writeCommandArtifacts(artifactsDir, "cleanup", cleanup);
    if (cleanup.exitCode !== 0) {
      cleanupFailure = commandError(
        "ssh",
        ["watchdog-smoke", "cleanup"],
        cleanup,
      );
    }
  } catch (error) {
    cleanupFailure = new Error(
      getErrorMessage(error, "Health watchdog smoke cleanup failed"),
    );
  } finally {
    await rm(ssh.temporaryRoot, { recursive: true, force: true });
  }
  if (failure) throw failure;
  if (cleanupFailure) throw cleanupFailure;
  if (!copiedArtifacts) {
    throw new Error("Health watchdog smoke completed without copied evidence");
  }

  const result: HealthWatchdogSmokeResult = {
    success: true,
    runId: options.runId,
    artifactsDir,
    target: {
      handle: target.user.handle,
      domain: target.user.domain,
      serverIp: ssh.serverIp,
    },
  };
  await writeFile(
    join(artifactsDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

export async function cleanupHealthWatchdogSmoke(
  options: CleanupHealthWatchdogSmokeOptions,
): Promise<CleanupHealthWatchdogSmokeResult> {
  const artifactsDir = resolve(
    options.artifactsDir ??
      join(
        options.rootDir,
        ".brains-ops",
        "watchdog-smoke",
        `cleanup-${options.runId}`,
      ),
  );
  const target = await resolveSmokeTarget(options.rootDir, options.handle);
  assertHealthWatchdogSmokeTarget({
    handle: target.user.handle,
    domain: target.user.domain,
    confirmation: options.confirmation,
    runId: options.runId,
  });
  await mkdir(artifactsDir, { recursive: true });

  const environment = requiredEnvironmentSchema.parse(
    options.env ?? process.env,
  );
  const ssh = await prepareSmokeSsh({
    target,
    environment,
    commandRunner: options.commandRunner ?? runStressCommand,
    fetchImpl: options.fetchImpl ?? fetch,
  });

  try {
    const cleanup = await runRemoteSmoke(ssh, "cleanup", options.runId);
    await writeCommandArtifacts(artifactsDir, "cleanup", cleanup);
    if (cleanup.stdout.trim()) {
      (options.logger ?? console.info)(cleanup.stdout.trim());
    }
    if (cleanup.exitCode !== 0) {
      throw commandError("ssh", ["watchdog-smoke", "cleanup"], cleanup);
    }
  } finally {
    await rm(ssh.temporaryRoot, { recursive: true, force: true });
  }

  const result: CleanupHealthWatchdogSmokeResult = {
    success: true,
    runId: options.runId,
    artifactsDir,
    target: {
      handle: target.user.handle,
      domain: target.user.domain,
      serverIp: ssh.serverIp,
    },
  };
  await writeFile(
    join(artifactsDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

async function resolveSmokeTarget(
  rootDir: string,
  handle: string,
): Promise<ResolvedSmokeTarget> {
  const registry = await loadPilotRegistry(rootDir);
  const user = registry.users.find((candidate) => candidate.handle === handle);
  if (!user) throw new Error(`Unknown pilot user: ${handle}`);
  return { pilot: registry.pilot, user };
}

async function prepareSmokeSsh(options: {
  target: ResolvedSmokeTarget;
  environment: z.infer<typeof requiredEnvironmentSchema>;
  commandRunner: StressCommandRunner;
  fetchImpl: FetchLike;
}): Promise<SmokeSshContext> {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "brains-ops-watchdog-smoke-"),
  );
  const sshKeyPath = join(temporaryRoot, "id_ed25519");
  const knownHostsPath = join(temporaryRoot, "known_hosts");
  try {
    const selector = encodeURIComponent(
      `brain=${options.target.pilot.contentRepoPrefix}${options.target.user.handle}`,
    );
    const response = await options.fetchImpl(
      `https://api.hetzner.cloud/v1/servers?label_selector=${selector}`,
      {
        headers: {
          Authorization: `Bearer ${options.environment.HCLOUD_TOKEN}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Hetzner server lookup failed with ${response.status}`);
    }
    const payload = hetznerServersSchema.parse(await response.json());
    if (payload.servers.length !== 1) {
      throw new Error(
        `Expected one smoke server, found ${payload.servers.length}`,
      );
    }
    const server = payload.servers[0];
    if (server?.status !== "running") {
      throw new Error("Smoke server is not running");
    }

    await writeFile(
      sshKeyPath,
      normalizePrivateKey(options.environment.KAMAL_SSH_PRIVATE_KEY),
      { mode: 0o600 },
    );
    await chmod(sshKeyPath, 0o600);
    const hostKeys = await options.commandRunner("ssh-keyscan", [
      "-T",
      "10",
      "-t",
      "ed25519",
      server.public_net.ipv4.ip,
    ]);
    if (hostKeys.exitCode !== 0 || !hostKeys.stdout.trim()) {
      throw new Error("Unable to resolve watchdog smoke SSH host key");
    }
    await writeFile(knownHostsPath, hostKeys.stdout, { mode: 0o600 });

    return {
      temporaryRoot,
      sshKeyPath,
      knownHostsPath,
      serverIp: server.public_net.ipv4.ip,
      commandRunner: options.commandRunner,
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runRemoteSmoke(
  context: SmokeSshContext,
  mode: "run" | "cleanup",
  runId: string,
): Promise<StressCommandResult> {
  return context.commandRunner(
    "ssh",
    [
      ...sshConnectionArgs(context),
      `root@${context.serverIp}`,
      "bash",
      "-s",
      "--",
      mode,
      runId,
    ],
    { stdin: renderHealthWatchdogSmokeRemoteScript() },
  );
}

async function copyRemoteArtifacts(
  context: SmokeSshContext,
  remoteDir: string,
  artifactsDir: string,
): Promise<StressCommandResult> {
  return context.commandRunner("scp", [
    ...sshConnectionArgs(context),
    "-r",
    `root@${context.serverIp}:${remoteDir}/.`,
    artifactsDir,
  ]);
}

function sshConnectionArgs(context: SmokeSshContext): string[] {
  return [
    "-i",
    context.sshKeyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${context.knownHostsPath}`,
  ];
}

async function artifactExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeCommandArtifacts(
  artifactsDir: string,
  name: string,
  result: StressCommandResult,
): Promise<void> {
  await Promise.all([
    writeFile(join(artifactsDir, `${name}.stdout.log`), result.stdout),
    writeFile(join(artifactsDir, `${name}.stderr.log`), result.stderr),
  ]);
}

function normalizePrivateKey(value: string): string {
  return `${value.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trimEnd()}\n`;
}
