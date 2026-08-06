import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { FetchLike } from "@brains/deploy-support/origin-ca";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

import {
  assertDirectorySyncStressTarget,
  directorySyncStressProfileSchema,
  resolveDirectorySyncStressPlan,
  runDirectorySyncStressPlan,
  sampleStressHealth,
  type DirectorySyncStressDriver,
  type DirectorySyncStressPhase,
  type DirectorySyncStressProfile,
  type DirectorySyncStressReport,
  type StressBaseline,
  type StressCleanupResult,
  type StressContainerState,
  type StressHealthSample,
  type StressMetrics,
  type StressPhaseResult,
  type StressRuntimeSample,
} from "./directory-sync-stress";
import { loadPilotRegistry, type ResolvedUser } from "./load-registry";
import type { PilotConfig } from "./schema";

const requiredEnvironmentSchema = z.object({
  HCLOUD_TOKEN: z.string().min(1),
  KAMAL_SSH_PRIVATE_KEY: z.string().min(1),
  CONTENT_REPO_ADMIN_TOKEN: z.string().min(1),
});

const hetznerServersSchema = z.object({
  servers: z.array(
    z.object({
      id: z.number().int(),
      status: z.string(),
      public_net: z.object({
        ipv4: z.object({ ip: z.string().min(1) }),
      }),
    }),
  ),
});

const healthPayloadSchema = z.object({
  status: z.string(),
  version: z.string(),
  entities: z.number().int().nonnegative(),
  entityCounts: z
    .array(
      z.object({
        entityType: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});

type HealthPayload = z.infer<typeof healthPayloadSchema>;

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

export interface DeployedDirectorySyncStressOptions {
  rootDir: string;
  handle: string;
  profile: DirectorySyncStressProfile;
  confirmation: string;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  commandRunner?: StressCommandRunner;
  logger?: (message: string) => void;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CleanupDirectorySyncStressOptions {
  rootDir: string;
  handle: string;
  confirmation: string;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: StressCommandRunner;
  logger?: (message: string) => void;
  now?: () => Date;
}

export interface DeployedDirectorySyncStressResult {
  runId: string;
  artifactsDir: string;
  target: {
    handle: string;
    domain: string;
    contentRepo: string;
  };
  startedAt: string;
  completedAt: string;
  report: DirectorySyncStressReport;
}

export interface CleanupDirectorySyncStressResult {
  success: boolean;
  artifactsDir: string;
  probesRemoved: number;
  probesRemaining: number;
  backupBranchesDeleted: string[];
  cleanupCommit?: string;
}

export async function runDeployedDirectorySyncStress(
  options: DeployedDirectorySyncStressOptions,
): Promise<DeployedDirectorySyncStressResult> {
  const now: () => Date = options.now ?? ((): Date => new Date());
  const startedAt = now().toISOString();
  const runId = createRunId(startedAt);
  const artifactsDir = resolve(
    options.artifactsDir ??
      join(options.rootDir, ".brains-ops", "stress", runId),
  );
  await mkdir(artifactsDir, { recursive: true });

  const { pilot, user } = await resolveStressUser(
    options.rootDir,
    options.handle,
  );
  assertDirectorySyncStressTarget({
    handle: user.handle,
    domain: user.domain,
    contentRepo: user.contentRepo,
    confirmation: options.confirmation,
  });

  const environment = requiredEnvironmentSchema.parse(
    options.env ?? process.env,
  );
  const profile = directorySyncStressProfileSchema.parse(options.profile);
  const driver = new SystemDirectorySyncStressDriver({
    runId,
    artifactsDir,
    user,
    githubOrg: pilot.githubOrg,
    serverLabel: `${pilot.contentRepoPrefix}${user.handle}`,
    environment,
    fetchImpl: options.fetchImpl ?? fetch,
    commandRunner: options.commandRunner ?? runStressCommand,
    logger: options.logger ?? console.info,
    now,
    sleep: options.sleep ?? Bun.sleep,
  });

  let report: DirectorySyncStressReport;
  try {
    report = await runDirectorySyncStressPlan(
      resolveDirectorySyncStressPlan(profile),
      driver,
    );
  } finally {
    await driver.dispose();
  }

  const result: DeployedDirectorySyncStressResult = {
    runId,
    artifactsDir,
    target: {
      handle: user.handle,
      domain: user.domain,
      contentRepo: `${pilot.githubOrg}/${user.contentRepo}`,
    },
    startedAt,
    completedAt: now().toISOString(),
    report,
  };
  await writeStressArtifacts(result);
  return result;
}

export async function cleanupDirectorySyncStress(
  options: CleanupDirectorySyncStressOptions,
): Promise<CleanupDirectorySyncStressResult> {
  const now: () => Date = options.now ?? ((): Date => new Date());
  const artifactsDir = resolve(
    options.artifactsDir ??
      join(
        options.rootDir,
        ".brains-ops",
        "stress",
        `cleanup-${createRunId(now().toISOString())}`,
      ),
  );
  await mkdir(artifactsDir, { recursive: true });

  const { pilot, user } = await resolveStressUser(
    options.rootDir,
    options.handle,
  );
  assertDirectorySyncStressTarget({
    handle: user.handle,
    domain: user.domain,
    contentRepo: user.contentRepo,
    confirmation: options.confirmation,
  });
  const token = (options.env ?? process.env)["CONTENT_REPO_ADMIN_TOKEN"];
  if (!token) {
    throw new Error("Missing CONTENT_REPO_ADMIN_TOKEN");
  }

  const runner = options.commandRunner ?? runStressCommand;
  const logger = options.logger ?? console.info;
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "brains-ops-directory-sync-cleanup-"),
  );
  const checkoutDir = join(temporaryRoot, "content");
  try {
    await cloneContentRepo(
      runner,
      `${pilot.githubOrg}/${user.contentRepo}`,
      checkoutDir,
      token,
    );
    const probesRemoved = await removeProbeFiles(checkoutDir);
    let cleanupCommit: string | undefined;
    if (probesRemoved > 0) {
      await requireCommand(runner, "git", ["add", "-A"], {
        cwd: checkoutDir,
        env: gitEnvironment(token),
      });
      await requireCommand(
        runner,
        "git",
        [
          "-c",
          "user.name=brains-ops",
          "-c",
          "user.email=ops@rizom.ai",
          "commit",
          "-m",
          "test(directory-sync): clean residual stress probes",
        ],
        { cwd: checkoutDir, env: gitEnvironment(token) },
      );
      await pushMainWithRebase(runner, checkoutDir, token);
      cleanupCommit = await gitOutput(runner, checkoutDir, token, [
        "rev-parse",
        "HEAD",
      ]);
      logger(`Removed ${probesRemoved} directory-sync stress probes`);
    }
    const probesRemaining = (await listProbeFiles(checkoutDir)).length;
    const backupBranchesDeleted =
      probesRemaining === 0
        ? await pruneStressBackupBranches(runner, checkoutDir, token)
        : [];
    const result: CleanupDirectorySyncStressResult = {
      success: probesRemaining === 0,
      artifactsDir,
      probesRemoved,
      probesRemaining,
      backupBranchesDeleted,
      ...(cleanupCommit ? { cleanupCommit } : {}),
    };
    await writeFile(
      join(artifactsDir, "cleanup.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

interface SystemDriverOptions {
  runId: string;
  artifactsDir: string;
  user: ResolvedUser;
  githubOrg: string;
  serverLabel: string;
  environment: z.infer<typeof requiredEnvironmentSchema>;
  fetchImpl: FetchLike;
  commandRunner: StressCommandRunner;
  logger: (message: string) => void;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
}

class SystemDirectorySyncStressDriver implements DirectorySyncStressDriver {
  readonly #options: SystemDriverOptions;
  readonly #healthSamples: StressHealthSample[] = [];
  readonly #runtimeSamples: StressRuntimeSample[] = [];
  readonly #activeHealthEndpoints = new Set<string>(["/health"]);
  #temporaryRoot: string | undefined;
  #checkoutDir: string | undefined;
  #sshKeyPath: string | undefined;
  #knownHostsPath: string | undefined;
  #serverIp: string | undefined;
  #container: string | undefined;
  #backupBranch: string | undefined;
  #originalTree: string | undefined;
  #initialContainerState: StressContainerState | undefined;
  #monitorStopped = true;
  #monitorPromise: Promise<void> | undefined;
  #monitorError: unknown;
  #monitorStart = "";
  #gateOffset = 0;
  #gateEndOffset: number | undefined;

  constructor(options: SystemDriverOptions) {
    this.#options = options;
  }

  async prepare(
    plan: ReturnType<typeof resolveDirectorySyncStressPlan>,
  ): Promise<StressBaseline> {
    this.#temporaryRoot = await mkdtemp(
      join(tmpdir(), "brains-ops-directory-sync-stress-"),
    );
    this.#checkoutDir = join(this.#temporaryRoot, "content");
    this.#sshKeyPath = join(this.#temporaryRoot, "id_ed25519");
    this.#knownHostsPath = join(this.#temporaryRoot, "known_hosts");

    this.#serverIp = await this.#resolveServerIp();
    await writeFile(
      this.#sshKeyPath,
      normalizePrivateKey(this.#options.environment.KAMAL_SSH_PRIVATE_KEY),
      { mode: 0o600 },
    );
    await chmod(this.#sshKeyPath, 0o600);
    const hostKeys = await this.#run("ssh-keyscan", [
      "-T",
      "10",
      "-t",
      "ed25519",
      this.#serverIp,
    ]);
    if (hostKeys.exitCode !== 0 || !hostKeys.stdout.trim()) {
      throw new Error("Unable to resolve smoke SSH host key");
    }
    await writeFile(this.#knownHostsPath, hostKeys.stdout, { mode: 0o600 });

    const containerResult = await this.#ssh([
      "docker",
      "ps",
      "--filter",
      "label=service=rover",
      "--filter",
      "label=role=web",
      "--format",
      "{{.Names}}",
    ]);
    this.#container = containerResult.stdout.trim().split(/\r?\n/)[0];
    if (!this.#container || !/^[A-Za-z0-9_.-]+$/.test(this.#container)) {
      throw new Error("Unable to resolve a running smoke container");
    }

    await cloneContentRepo(
      this.#options.commandRunner,
      `${this.#options.githubOrg}/${this.#options.user.contentRepo}`,
      this.#checkoutDir,
      this.#options.environment.CONTENT_REPO_ADMIN_TOKEN,
    );
    if ((await listProbeFiles(this.#checkoutDir)).length > 0) {
      throw new Error("Directory-sync stress probes already exist");
    }

    const originalHead = await this.#gitOutput(["rev-parse", "HEAD"]);
    this.#originalTree = await this.#gitOutput(["rev-parse", "HEAD^{tree}"]);
    this.#initialContainerState = await this.#readContainerState();

    const baseline = await this.#waitForHealthSnapshot(60_000);
    if (!baseline) {
      throw new Error("Smoke health was unavailable before stress testing");
    }

    this.#backupBranch = `ops/directory-sync-stress-backup-${this.#options.runId}`;
    await this.#git([
      "push",
      "origin",
      `HEAD:refs/heads/${this.#backupBranch}`,
    ]);
    await this.#discoverHealthEndpoints();
    await writeFile(
      join(this.#options.artifactsDir, "state.json"),
      `${JSON.stringify(
        {
          runId: this.#options.runId,
          profile: plan.profile,
          originalHead,
          originalTree: this.#originalTree,
          backupBranch: this.#backupBranch,
          baseline: {
            entities: baseline.entities,
            notes: noteCount(baseline),
            version: baseline.version,
          },
        },
        null,
        2,
      )}\n`,
    );

    this.#options.logger(
      `Prepared ${plan.profile} directory-sync stress run for ${this.#options.user.handle}`,
    );
    return {
      entities: baseline.entities,
      notes: noteCount(baseline),
      version: baseline.version,
    };
  }

  async startMonitoring(): Promise<void> {
    this.#assertPrepared();
    this.#monitorStopped = false;
    this.#monitorError = undefined;
    this.#gateOffset = this.#healthSamples.length;
    this.#gateEndOffset = undefined;
    this.#monitorStart = this.#options.now().toISOString();
    this.#monitorPromise = Promise.all([
      this.#monitorHealth(),
      this.#monitorRuntime(),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#monitorError = error;
        this.#monitorStopped = true;
      });
  }

  async executePhase(
    phase: DirectorySyncStressPhase,
    baseline: StressBaseline,
  ): Promise<StressPhaseResult> {
    this.#assertPrepared();
    const checkoutDir = this.#checkoutDir;
    if (!checkoutDir) {
      throw new Error("Directory-sync stress checkout is not prepared");
    }
    await this.#syncCheckout();
    const healthSampleOffset = this.#healthSamples.length;
    const started = this.#options.now().getTime();

    await applyDirectorySyncStressPhase(checkoutDir, phase);
    await this.#git(["add", "-A"]);
    await this.#git([
      "-c",
      "user.name=brains-ops",
      "-c",
      "user.email=ops@rizom.ai",
      "commit",
      "-m",
      `test(directory-sync): stress ${phase.id}`,
    ]);
    await pushMainWithRebase(
      this.#options.commandRunner,
      checkoutDir,
      this.#options.environment.CONTENT_REPO_ADMIN_TOKEN,
    );
    const pushedAt = this.#options.now().getTime();
    const commit = await this.#gitOutput(["rev-parse", "HEAD"]);
    const commitLatencyMs = await this.#waitForRuntimeCommit(
      commit,
      15 * 60_000,
    );
    if (commitLatencyMs === undefined) {
      return failedPhase(phase, "runtime did not pull the phase commit");
    }

    let persistenceLatencyMs: number | undefined;
    if (phase.operation === "rename") {
      const expectedNotes = baseline.notes + phase.targetProbeCount;
      if (phase.settleMs > 0) {
        await this.#options.sleep(phase.settleMs);
      }
      const snapshot = await this.#waitForStableEntityBaseline(
        expectedNotes,
        undefined,
        20 * 60_000,
      );
      persistenceLatencyMs = this.#options.now().getTime() - pushedAt;
      if (!snapshot) {
        return failedPhase(
          phase,
          `health did not stabilize at ${expectedNotes} notes`,
          commitLatencyMs,
          persistenceLatencyMs,
        );
      }
    } else if (phase.operation === "add" || phase.operation === "delete") {
      const expectedNotes = baseline.notes + phase.targetProbeCount;
      const persistenceStarted = this.#options.now().getTime();
      const snapshot = await this.#waitForEntityBaseline(
        expectedNotes,
        undefined,
        20 * 60_000,
      );
      persistenceLatencyMs = this.#options.now().getTime() - persistenceStarted;
      if (!snapshot) {
        return failedPhase(
          phase,
          `health did not reach ${expectedNotes} notes`,
          commitLatencyMs,
          persistenceLatencyMs,
        );
      }
    }

    if (phase.operation !== "rename" && phase.settleMs > 0) {
      await this.#options.sleep(phase.settleMs);
    }

    const healthFailure = this.#healthSamples
      .slice(healthSampleOffset)
      .find((sample) => !sample.ok);
    if (healthFailure) {
      return failedPhase(
        phase,
        `${healthFailure.endpoint} unavailable (${healthFailure.status === 0 ? (healthFailure.error ?? "unknown") : healthFailure.status})`,
        commitLatencyMs,
        persistenceLatencyMs,
      );
    }

    this.#options.logger(
      `Completed ${phase.id} in ${this.#options.now().getTime() - started}ms`,
    );
    return {
      id: phase.id,
      operation: phase.operation,
      count: phase.count,
      success: true,
      commitLatencyMs,
      ...(persistenceLatencyMs === undefined ? {} : { persistenceLatencyMs }),
    };
  }

  async cleanup(baseline: StressBaseline): Promise<StressCleanupResult> {
    if (!this.#checkoutDir) {
      return {
        success: false,
        probesRemaining: 0,
        error: "stress checkout was not prepared",
      };
    }

    try {
      await this.#syncCheckout(true);
      const removed = await removeProbeFiles(this.#checkoutDir);
      if (removed > 0) {
        await this.#git(["add", "-A"]);
        await this.#git([
          "-c",
          "user.name=brains-ops",
          "-c",
          "user.email=ops@rizom.ai",
          "commit",
          "-m",
          "test(directory-sync): remove stress probes",
        ]);
        await pushMainWithRebase(
          this.#options.commandRunner,
          this.#checkoutDir,
          this.#options.environment.CONTENT_REPO_ADMIN_TOKEN,
        );
      }

      const probesRemaining = (await listProbeFiles(this.#checkoutDir)).length;
      this.#gateEndOffset = this.#healthSamples.length;
      const finalSnapshot = await this.#waitForEntityBaseline(
        baseline.notes,
        baseline.entities,
        20 * 60_000,
      );
      await this.#syncCheckout(true);
      const finalTree = await this.#gitOutput(["rev-parse", "HEAD^{tree}"]);
      const contentTreeRestored = finalTree === this.#originalTree;
      const success =
        probesRemaining === 0 &&
        finalSnapshot !== undefined &&
        contentTreeRestored;
      if (success && this.#backupBranch) {
        const deletion = await this.#git(
          ["push", "origin", "--delete", this.#backupBranch],
          false,
        );
        if (deletion.exitCode !== 0) {
          this.#options.logger(
            `Warning: unable to delete backup branch ${this.#backupBranch}`,
          );
        }
      }

      return {
        success,
        probesRemaining,
        ...(finalSnapshot
          ? {
              finalEntities: finalSnapshot.entities,
              finalNotes: noteCount(finalSnapshot),
            }
          : {}),
        contentTreeRestored,
        ...(!success
          ? {
              error: !finalSnapshot
                ? "entity baseline was not restored before cleanup timeout"
                : !contentTreeRestored
                  ? "content tree differs from the pre-stress baseline"
                  : "stress probes remain after cleanup",
            }
          : {}),
      };
    } catch (error) {
      return {
        success: false,
        probesRemaining: (await listProbeFiles(this.#checkoutDir)).length,
        error: getErrorMessage(error),
      };
    }
  }

  async stopMonitoring(): Promise<StressMetrics> {
    this.#monitorStopped = true;
    await this.#monitorPromise;
    await writeFile(
      join(this.#options.artifactsDir, "health-samples.json"),
      `${JSON.stringify(this.#healthSamples, null, 2)}\n`,
    );
    if (this.#container && this.#monitorStart) {
      const logs = await this.#ssh(
        ["docker", "logs", "--since", this.#monitorStart, this.#container],
        false,
      );
      await writeFile(
        join(this.#options.artifactsDir, "runtime.log"),
        `${logs.stdout}${logs.stderr}`,
      );
    }
    const container = await this.#readContainerState();
    const gateEndOffset = this.#gateEndOffset ?? this.#healthSamples.length;
    const metrics: StressMetrics = {
      health: this.#healthSamples.slice(this.#gateOffset, gateEndOffset),
      runtime: this.#runtimeSamples,
      ...(container ? { container } : {}),
    };
    if (this.#monitorError) {
      throw this.#monitorError;
    }
    return metrics;
  }

  async dispose(): Promise<void> {
    this.#monitorStopped = true;
    await this.#monitorPromise;
    if (this.#temporaryRoot) {
      await rm(this.#temporaryRoot, { recursive: true, force: true });
    }
  }

  async #readContainerState(): Promise<StressContainerState | undefined> {
    if (!this.#container) return undefined;
    const result = await this.#ssh(
      ["docker", "inspect", this.#container],
      false,
    );
    if (result.exitCode !== 0) return undefined;
    try {
      const inspections = z
        .array(
          z.object({
            RestartCount: z.number().int().nonnegative(),
            State: z.object({
              Status: z.string(),
              OOMKilled: z.boolean(),
            }),
          }),
        )
        .parse(JSON.parse(result.stdout));
      const inspection = inspections[0];
      if (!inspection) return undefined;
      return {
        status: inspection.State.Status,
        restartCount: Math.max(
          0,
          inspection.RestartCount -
            (this.#initialContainerState?.restartCount ?? 0),
        ),
        oomKilled:
          inspection.State.OOMKilled &&
          !(this.#initialContainerState?.oomKilled ?? false),
      };
    } catch {
      return undefined;
    }
  }

  async #resolveServerIp(): Promise<string> {
    const selector = encodeURIComponent(`brain=${this.#options.serverLabel}`);
    const response = await this.#options.fetchImpl(
      `https://api.hetzner.cloud/v1/servers?label_selector=${selector}`,
      {
        headers: {
          Authorization: `Bearer ${this.#options.environment.HCLOUD_TOKEN}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Hetzner server lookup failed with ${response.status}`);
    }
    const payload = hetznerServersSchema.parse(await response.json());
    const server = payload.servers[0];
    if (server?.status !== "running") {
      throw new Error("Smoke server is not running");
    }
    return server.public_net.ipv4.ip;
  }

  async #discoverHealthEndpoints(): Promise<void> {
    for (const endpoint of [
      "/health/live",
      "/health/ready",
      "/health/operate",
    ]) {
      const sample = await sampleStressHealth(
        `https://${this.#options.user.domain}${endpoint}`,
        {
          fetchImpl: this.#options.fetchImpl,
          now: this.#options.now,
          timeoutMs: 5_000,
        },
      );
      if (sample.status !== 404) {
        this.#activeHealthEndpoints.add(endpoint);
      }
    }
  }

  async #monitorHealth(): Promise<void> {
    while (!this.#monitorStopped) {
      for (const endpoint of this.#activeHealthEndpoints) {
        this.#healthSamples.push(
          await sampleStressHealth(
            `https://${this.#options.user.domain}${endpoint}`,
            {
              fetchImpl: this.#options.fetchImpl,
              now: this.#options.now,
              timeoutMs: 20_000,
            },
          ),
        );
      }
      await this.#options.sleep(4_000);
    }
  }

  async #monitorRuntime(): Promise<void> {
    const container = this.#container;
    if (!container) {
      throw new Error("Directory-sync stress container is not prepared");
    }
    while (!this.#monitorStopped) {
      const result = await this.#ssh(
        [
          "timeout",
          "15",
          "docker",
          "stats",
          "--no-stream",
          "--format",
          "{{.CPUPerc}},{{.MemPerc}},{{.PIDs}}",
          container,
        ],
        false,
      );
      const parsed = parseStressRuntimeSample(
        result.stdout.trim(),
        this.#options.now().toISOString(),
      );
      if (parsed) {
        this.#runtimeSamples.push(parsed);
      }
      await this.#options.sleep(1_000);
    }
  }

  async #waitForRuntimeCommit(
    commit: string,
    timeoutMs: number,
  ): Promise<number | undefined> {
    const container = this.#container;
    if (!container) {
      throw new Error("Directory-sync stress container is not prepared");
    }
    const started = this.#options.now().getTime();
    while (this.#options.now().getTime() - started < timeoutMs) {
      const result = await this.#ssh(
        [
          "docker",
          "exec",
          container,
          "git",
          "-C",
          "/app/brain-data",
          "merge-base",
          "--is-ancestor",
          commit,
          "HEAD",
        ],
        false,
      );
      if (result.exitCode === 0) {
        return this.#options.now().getTime() - started;
      }
      await this.#options.sleep(5_000);
    }
    return undefined;
  }

  async #waitForHealthSnapshot(
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    return this.#waitForEntityBaseline(undefined, undefined, timeoutMs);
  }

  async #waitForEntityBaseline(
    expectedNotes: number | undefined,
    expectedEntities: number | undefined,
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    const started = this.#options.now().getTime();
    while (this.#options.now().getTime() - started < timeoutMs) {
      const snapshot = await this.#fetchHealthPayload();
      if (
        snapshot &&
        (expectedNotes === undefined ||
          noteCount(snapshot) === expectedNotes) &&
        (expectedEntities === undefined ||
          snapshot.entities === expectedEntities)
      ) {
        return snapshot;
      }
      await this.#options.sleep(5_000);
    }
    return undefined;
  }

  async #waitForStableEntityBaseline(
    expectedNotes: number | undefined,
    expectedEntities: number | undefined,
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    const started = this.#options.now().getTime();
    let consecutiveMatches = 0;
    while (this.#options.now().getTime() - started < timeoutMs) {
      const snapshot = await this.#fetchHealthPayload();
      const matches =
        snapshot !== undefined &&
        (expectedNotes === undefined ||
          noteCount(snapshot) === expectedNotes) &&
        (expectedEntities === undefined ||
          snapshot.entities === expectedEntities);
      if (matches) {
        consecutiveMatches += 1;
        if (consecutiveMatches === 2) {
          return snapshot;
        }
      } else {
        consecutiveMatches = 0;
      }
      await this.#options.sleep(5_000);
    }
    return undefined;
  }

  async #fetchHealthPayload(): Promise<HealthPayload | undefined> {
    const started = this.#options.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.#options.fetchImpl(
        `https://${this.#options.user.domain}/health`,
        { signal: controller.signal },
      );
      const body = await response.text();
      this.#healthSamples.push({
        timestamp: started.toISOString(),
        endpoint: "/health",
        status: response.status,
        durationMs: Math.max(
          0,
          this.#options.now().getTime() - started.getTime(),
        ),
        ok: response.ok,
      });
      if (!response.ok) return undefined;
      return healthPayloadSchema.parse(JSON.parse(body));
    } catch (error) {
      this.#healthSamples.push({
        timestamp: started.toISOString(),
        endpoint: "/health",
        status: 0,
        durationMs: Math.max(
          0,
          this.#options.now().getTime() - started.getTime(),
        ),
        ok: false,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #syncCheckout(hardReset = false): Promise<void> {
    await this.#git(["fetch", "origin", "main"]);
    if (hardReset) {
      await this.#git(["reset", "--hard", "origin/main"]);
    } else {
      await this.#git(["pull", "--rebase", "origin", "main"]);
    }
  }

  async #git(
    args: readonly string[],
    required = true,
  ): Promise<StressCommandResult> {
    const checkoutDir = this.#checkoutDir;
    if (!checkoutDir) {
      throw new Error("Directory-sync stress checkout is not prepared");
    }
    const result = await this.#run("git", args, {
      cwd: checkoutDir,
      env: gitEnvironment(this.#options.environment.CONTENT_REPO_ADMIN_TOKEN),
    });
    if (required && result.exitCode !== 0) {
      throw commandError("git", args, result);
    }
    return result;
  }

  async #gitOutput(args: readonly string[]): Promise<string> {
    const result = await this.#git(args);
    return result.stdout.trim();
  }

  async #ssh(
    remoteArgs: readonly string[],
    required = true,
  ): Promise<StressCommandResult> {
    const sshKeyPath = this.#sshKeyPath;
    const knownHostsPath = this.#knownHostsPath;
    const serverIp = this.#serverIp;
    if (!sshKeyPath || !knownHostsPath || !serverIp) {
      throw new Error("Directory-sync stress SSH access is not prepared");
    }
    const result = await this.#run("ssh", [
      "-i",
      sshKeyPath,
      "-o",
      "BatchMode=yes",
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${knownHostsPath}`,
      `root@${serverIp}`,
      ...remoteArgs,
    ]);
    if (required && result.exitCode !== 0) {
      throw commandError("ssh", remoteArgs, result);
    }
    return result;
  }

  async #run(
    command: string,
    args: readonly string[],
    options?: StressCommandOptions,
  ): Promise<StressCommandResult> {
    return this.#options.commandRunner(command, args, options);
  }

  #assertPrepared(): void {
    if (
      !this.#checkoutDir ||
      !this.#sshKeyPath ||
      !this.#knownHostsPath ||
      !this.#serverIp ||
      !this.#container
    ) {
      throw new Error("Directory-sync stress driver is not prepared");
    }
  }
}

async function resolveStressUser(
  rootDir: string,
  handle: string,
): Promise<{ pilot: PilotConfig; user: ResolvedUser }> {
  const registry = await loadPilotRegistry(rootDir);
  const user = registry.users.find((candidate) => candidate.handle === handle);
  if (!user) {
    throw new Error(`Unknown pilot user: ${handle}`);
  }
  return { pilot: registry.pilot, user };
}

export async function applyDirectorySyncStressPhase(
  checkoutDir: string,
  phase: DirectorySyncStressPhase,
): Promise<void> {
  const existing = await listProbeFiles(checkoutDir);
  switch (phase.operation) {
    case "add": {
      const toCreate = phase.targetProbeCount - existing.length;
      if (toCreate !== phase.count) {
        throw new Error(
          `${phase.id} expected to add ${phase.count} probes from ${existing.length}`,
        );
      }
      const existingNumbers = existing
        .map(probeNumber)
        .filter((value): value is number => value !== undefined);
      const start =
        existingNumbers.length === 0 ? 1 : Math.max(...existingNumbers) + 1;
      for (let number = start; number < start + toCreate; number += 1) {
        const index = String(number).padStart(3, "0");
        await writeFile(
          join(checkoutDir, `directory-sync-stress-${index}.md`),
          [
            "---",
            `title: "Directory Sync Stress ${index}"`,
            "---",
            "",
            `Deterministic directory-sync stress probe ${index}.`,
            "Payload: abcdefghijklmnopqrstuvwxyz-0123456789-abcdefghijklmnopqrstuvwxyz.",
            "",
          ].join("\n"),
        );
      }
      break;
    }
    case "update": {
      if (existing.length !== phase.count) {
        throw new Error(
          `${phase.id} expected ${phase.count} probes, found ${existing.length}`,
        );
      }
      for (const file of existing) {
        const path = join(checkoutDir, file);
        const content = await readFile(path, "utf8");
        await writeFile(
          path,
          `${content.trimEnd()}\n\nUpdate marker: ${phase.id}.\n`,
        );
      }
      break;
    }
    case "rename": {
      const candidates = existing
        .filter((file) => /^directory-sync-stress-\d+\.md$/.test(file))
        .slice(0, phase.count);
      if (candidates.length !== phase.count) {
        throw new Error(
          `${phase.id} expected ${phase.count} unrenamed probes, found ${candidates.length}`,
        );
      }
      for (const file of candidates) {
        await rename(
          join(checkoutDir, file),
          join(
            checkoutDir,
            file.replace(
              "directory-sync-stress-",
              "directory-sync-stress-renamed-",
            ),
          ),
        );
      }
      break;
    }
    case "delete": {
      if (existing.length !== phase.count) {
        throw new Error(
          `${phase.id} expected ${phase.count} probes, found ${existing.length}`,
        );
      }
      await Promise.all(
        existing.map((file) => rm(join(checkoutDir, file), { force: true })),
      );
      break;
    }
  }
}

export async function listProbeFiles(checkoutDir: string): Promise<string[]> {
  const files = await readdir(checkoutDir);
  return files
    .filter(
      (file) =>
        /^directory-sync-stress-(?:renamed-)?\d+\.md$/.test(file) &&
        !file.includes("/"),
    )
    .sort();
}

export async function removeProbeFiles(checkoutDir: string): Promise<number> {
  const files = await listProbeFiles(checkoutDir);
  await Promise.all(
    files.map((file) => rm(join(checkoutDir, file), { force: true })),
  );
  return files.length;
}

function probeNumber(file: string): number | undefined {
  const value = file.match(/(\d+)\.md$/)?.[1];
  return value ? Number.parseInt(value, 10) : undefined;
}

function noteCount(payload: HealthPayload): number {
  return (
    payload.entityCounts.find((entry) => entry.entityType === "note")?.count ??
    0
  );
}

function failedPhase(
  phase: DirectorySyncStressPhase,
  error: string,
  commitLatencyMs?: number,
  persistenceLatencyMs?: number,
): StressPhaseResult {
  return {
    id: phase.id,
    operation: phase.operation,
    count: phase.count,
    success: false,
    ...(commitLatencyMs === undefined ? {} : { commitLatencyMs }),
    ...(persistenceLatencyMs === undefined ? {} : { persistenceLatencyMs }),
    error,
  };
}

export function parseStressRuntimeSample(
  output: string,
  timestamp: string,
): StressRuntimeSample | undefined {
  const [cpuText, memoryText, pidsText] = output.split(",");
  if (!cpuText || !memoryText || !pidsText) return undefined;
  const cpuPercent = Number.parseFloat(cpuText.replace("%", ""));
  const memoryPercent = Number.parseFloat(memoryText.replace("%", ""));
  const pids = Number.parseInt(pidsText, 10);
  if (
    !Number.isFinite(cpuPercent) ||
    !Number.isFinite(memoryPercent) ||
    !Number.isFinite(pids)
  ) {
    return undefined;
  }
  return { timestamp, cpuPercent, memoryPercent, pids };
}

async function cloneContentRepo(
  runner: StressCommandRunner,
  repository: string,
  checkoutDir: string,
  token: string,
): Promise<void> {
  await requireCommand(
    runner,
    "gh",
    ["repo", "clone", repository, checkoutDir, "--", "--branch", "main"],
    { env: gitEnvironment(token) },
  );
  await requireCommand(
    runner,
    "git",
    [
      "config",
      "--local",
      "credential.helper",
      '!f() { test "$1" = get && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f',
    ],
    { cwd: checkoutDir, env: gitEnvironment(token) },
  );
  await requireCommand(runner, "git", ["reset", "--hard", "origin/main"], {
    cwd: checkoutDir,
    env: gitEnvironment(token),
  });
}

async function pushMainWithRebase(
  runner: StressCommandRunner,
  checkoutDir: string,
  token: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const push = await runner("git", ["push", "origin", "main"], {
      cwd: checkoutDir,
      env: gitEnvironment(token),
    });
    if (push.exitCode === 0) return;
    await requireCommand(
      runner,
      "git",
      ["pull", "--rebase", "origin", "main"],
      { cwd: checkoutDir, env: gitEnvironment(token) },
    );
  }
  throw new Error("Unable to push content main after five rebase attempts");
}

async function pruneStressBackupBranches(
  runner: StressCommandRunner,
  checkoutDir: string,
  token: string,
): Promise<string[]> {
  const result = await requireCommand(
    runner,
    "git",
    [
      "ls-remote",
      "--heads",
      "origin",
      "refs/heads/ops/directory-sync-stress-backup-*",
    ],
    { cwd: checkoutDir, env: gitEnvironment(token) },
  );
  const branches = result.stdout
    .split(/\r?\n/)
    .map(
      (line) =>
        line.match(
          /\trefs\/heads\/(ops\/directory-sync-stress-backup-[^\s]+)$/,
        )?.[1],
    )
    .filter((branch): branch is string => branch !== undefined)
    .sort();
  for (const branch of branches) {
    await requireCommand(
      runner,
      "git",
      ["push", "origin", "--delete", branch],
      {
        cwd: checkoutDir,
        env: gitEnvironment(token),
      },
    );
  }
  return branches;
}

async function gitOutput(
  runner: StressCommandRunner,
  checkoutDir: string,
  token: string,
  args: readonly string[],
): Promise<string> {
  const result = await requireCommand(runner, "git", args, {
    cwd: checkoutDir,
    env: gitEnvironment(token),
  });
  return result.stdout.trim();
}

function gitEnvironment(token: string): NodeJS.ProcessEnv {
  return { GH_TOKEN: token, GITHUB_TOKEN: token };
}

async function requireCommand(
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

function commandError(
  command: string,
  args: readonly string[],
  result: StressCommandResult,
): Error {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new Error(
    `${command} ${args.join(" ")} exited with ${result.exitCode}${detail ? `: ${detail}` : ""}`,
  );
}

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

function normalizePrivateKey(value: string): string {
  return `${value.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trimEnd()}\n`;
}

function createRunId(timestamp: string): string {
  return timestamp.replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function writeStressArtifacts(
  result: DeployedDirectorySyncStressResult,
): Promise<void> {
  await writeFile(
    join(result.artifactsDir, "report.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  await writeFile(
    join(result.artifactsDir, "report.md"),
    renderStressMarkdown(result),
  );
}

function renderStressMarkdown(
  result: DeployedDirectorySyncStressResult,
): string {
  const runtime = result.report.metrics.runtime;
  const health = result.report.metrics.health;
  const cpu = runtime.map((sample) => sample.cpuPercent).sort((a, b) => a - b);
  const memory = runtime.map((sample) => sample.memoryPercent);
  const failures = health.filter((sample) => !sample.ok);
  const lines = [
    "# Directory-sync stress report",
    "",
    `- Run: \`${result.runId}\``,
    `- Target: \`${result.target.handle}\` (${result.target.domain})`,
    `- Profile: \`${result.report.profile}\``,
    `- Version: \`${result.report.baseline.version}\``,
    `- Result: **${result.report.success ? "PASS" : "FAIL"}**`,
    `- Started: ${result.startedAt}`,
    `- Completed: ${result.completedAt}`,
    "",
    "## Phases",
    "",
    "| Phase | Operation | Count | Result | Pull latency | Persistence latency |",
    "| --- | --- | ---: | --- | ---: | ---: |",
    ...result.report.phases.map(
      (phase) =>
        `| ${phase.id} | ${phase.operation} | ${phase.count} | ${phase.success ? "pass" : `fail: ${phase.error ?? "unknown"}`} | ${formatDuration(phase.commitLatencyMs)} | ${formatDuration(phase.persistenceLatencyMs)} |`,
    ),
    "",
    "## Runtime",
    "",
    `- Samples: ${runtime.length}`,
    `- CPU p50/p95/p99/max: ${formatPercent(percentile(cpu, 0.5))} / ${formatPercent(percentile(cpu, 0.95))} / ${formatPercent(percentile(cpu, 0.99))} / ${formatPercent(cpu.at(-1))}`,
    `- Memory max: ${formatPercent(memory.length ? Math.max(...memory) : undefined)}`,
    `- PIDs max: ${runtime.length ? Math.max(...runtime.map((sample) => sample.pids)) : "n/a"}`,
    `- Container status/restarts/OOM: ${result.report.metrics.container ? `${result.report.metrics.container.status} / ${result.report.metrics.container.restartCount} / ${result.report.metrics.container.oomKilled}` : "unknown"}`,
    `- Health samples: ${health.length}`,
    `- Health failures: ${failures.length}`,
    "",
    "## Cleanup",
    "",
    `- Result: ${result.report.cleanup.success ? "pass" : "fail"}`,
    `- Remaining probes: ${result.report.cleanup.probesRemaining}`,
    `- Final entities: ${result.report.cleanup.finalEntities ?? "unknown"}`,
    `- Final notes: ${result.report.cleanup.finalNotes ?? "unknown"}`,
    `- Content tree restored: ${result.report.cleanup.contentTreeRestored ?? "unknown"}`,
    "",
  ];
  if (result.report.failure) {
    lines.push("## Failure", "", result.report.failure, "");
  }
  return `${lines.join("\n")}\n`;
}

function percentile(
  values: readonly number[],
  ratio: number,
): number | undefined {
  if (values.length === 0) return undefined;
  const index = Math.max(0, Math.ceil(values.length * ratio) - 1);
  return values[index];
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(2)}%`;
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? "n/a" : `${(value / 1_000).toFixed(1)}s`;
}
