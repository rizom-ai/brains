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
  directorySyncStressPlanSchema,
  directorySyncStressProfileSchema,
  resolveDirectorySyncStressPlan,
  runDirectorySyncStressPlan,
  type DirectorySyncStressDriver,
  type DirectorySyncStressPhase,
  type DirectorySyncStressPlan,
  type DirectorySyncStressProfile,
  type DirectorySyncStressReport,
  type StressBaseline,
  type StressCleanupResult,
  type StressContainerState,
  type StressMetrics,
  type StressPhaseResult,
  type StressRuntimeSample,
} from "./directory-sync-stress";
import { loadPilotRegistry, type ResolvedUser } from "./load-registry";
import type { PilotConfig } from "./schema";
import {
  commandError,
  runStressCommand,
  type StressCommandOptions,
  type StressCommandResult,
  type StressCommandRunner,
} from "./stress-command";
import { GitCheckout } from "./stress-git-checkout";
import { noteCount, StressHealthMonitor } from "./stress-health-monitor";

export {
  runStressCommand,
  type StressCommandOptions,
  type StressCommandResult,
  type StressCommandRunner,
} from "./stress-command";

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

const stressQueueHealthPayloadSchema = z.object({
  status: z.literal("ready"),
  operationalStatus: z.literal("operational"),
  resources: z.object({
    queue: z.object({
      totals: z.object({
        pending: z.number().int().nonnegative(),
        processing: z.number().int().nonnegative(),
      }),
      byType: z.array(
        z.object({
          type: z.string(),
          status: z.string(),
          count: z.number().int().nonnegative(),
        }),
      ),
    }),
  }),
});

interface StressQueueSnapshot {
  pending: number;
  processing: number;
  completedImports: number;
}

export interface DeployedDirectorySyncStressOptions {
  rootDir: string;
  handle: string;
  profile: DirectorySyncStressProfile;
  plan?: DirectorySyncStressPlan;
  confirmation: string;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  commandRunner?: StressCommandRunner;
  logger?: (message: string) => void;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface VerifyDirectorySyncStressAccessOptions {
  rootDir: string;
  handle: string;
  confirmation: string;
  artifactsDir?: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: StressCommandRunner;
  now?: () => Date;
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

export interface VerifyDirectorySyncStressAccessResult {
  success: true;
  artifactsDir: string;
  checkedAt: string;
  remoteHead: string;
  target: {
    handle: string;
    domain: string;
    contentRepo: string;
  };
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
  const profile = directorySyncStressProfileSchema.parse(options.profile);
  const plan = options.plan
    ? directorySyncStressPlanSchema.parse(options.plan)
    : resolveDirectorySyncStressPlan(profile);
  if (plan.profile !== profile) {
    throw new Error(
      `Directory-sync stress plan profile ${plan.profile} does not match requested profile ${profile}`,
    );
  }
  if ((plan.maximumExternalAiCalls ?? 0) === 0) {
    assertHermeticDirectorySyncPosture(user);
  }

  const environment = requiredEnvironmentSchema.parse(
    options.env ?? process.env,
  );
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
    report = await runDirectorySyncStressPlan(plan, driver);
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

export async function verifyDirectorySyncStressAccess(
  options: VerifyDirectorySyncStressAccessOptions,
): Promise<VerifyDirectorySyncStressAccessResult> {
  const now: () => Date = options.now ?? ((): Date => new Date());
  const checkedAt = now().toISOString();
  const runId = createRunId(checkedAt);
  const artifactsDir = resolve(
    options.artifactsDir ??
      join(options.rootDir, ".brains-ops", "stress", `access-check-${runId}`),
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
  assertHermeticDirectorySyncPosture(user);

  const token = (options.env ?? process.env)["CONTENT_REPO_ADMIN_TOKEN"];
  if (!token) {
    throw new Error("Missing CONTENT_REPO_ADMIN_TOKEN");
  }

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "brains-ops-directory-sync-access-check-"),
  );
  try {
    const checkout = await GitCheckout.clone(
      options.commandRunner ?? runStressCommand,
      `${pilot.githubOrg}/${user.contentRepo}`,
      join(temporaryRoot, "content"),
      token,
    );
    const remoteHead = await checkout.output(["rev-parse", "HEAD"]);
    await checkout.run([
      "push",
      "--dry-run",
      "origin",
      `HEAD:refs/heads/ops/directory-sync-stress-access-check-${runId}`,
    ]);

    const result: VerifyDirectorySyncStressAccessResult = {
      success: true,
      artifactsDir,
      checkedAt,
      remoteHead,
      target: {
        handle: user.handle,
        domain: user.domain,
        contentRepo: `${pilot.githubOrg}/${user.contentRepo}`,
      },
    };
    await writeFile(
      join(artifactsDir, "access-check.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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
    const checkout = await GitCheckout.clone(
      runner,
      `${pilot.githubOrg}/${user.contentRepo}`,
      checkoutDir,
      token,
    );
    const probesRemoved = await removeProbeFiles(checkout.dir);
    let cleanupCommit: string | undefined;
    if (probesRemoved > 0) {
      await checkout.commitAll(
        "test(directory-sync): clean residual stress probes",
      );
      await checkout.pushMainWithRebase();
      cleanupCommit = await checkout.output(["rev-parse", "HEAD"]);
      logger(`Removed ${probesRemoved} directory-sync stress probes`);
    }
    const probesRemaining = (await listProbeFiles(checkout.dir)).length;
    const backupBranchesDeleted =
      probesRemaining === 0 ? await checkout.pruneStressBackupBranches() : [];
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

interface InspectedContainerState extends StressContainerState {
  startedAt: string;
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
  readonly #monitor: StressHealthMonitor;
  #temporaryRoot: string | undefined;
  #checkout: GitCheckout | undefined;
  #sshKeyPath: string | undefined;
  #knownHostsPath: string | undefined;
  #serverIp: string | undefined;
  #container: string | undefined;
  #backupBranch: string | undefined;
  #originalTree: string | undefined;
  #initialContainerState: InspectedContainerState | undefined;

  constructor(options: SystemDriverOptions) {
    this.#options = options;
    this.#monitor = new StressHealthMonitor({
      domain: options.user.domain,
      fetchImpl: options.fetchImpl,
      now: options.now,
      sleep: options.sleep,
      sampleRuntime: (): Promise<StressRuntimeSample | undefined> =>
        this.#sampleRuntime(),
    });
  }

  async prepare(
    plan: ReturnType<typeof resolveDirectorySyncStressPlan>,
  ): Promise<StressBaseline> {
    this.#temporaryRoot = await mkdtemp(
      join(tmpdir(), "brains-ops-directory-sync-stress-"),
    );
    const checkoutDir = join(this.#temporaryRoot, "content");
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

    const checkout = await GitCheckout.clone(
      this.#options.commandRunner,
      `${this.#options.githubOrg}/${this.#options.user.contentRepo}`,
      checkoutDir,
      this.#options.environment.CONTENT_REPO_ADMIN_TOKEN,
    );
    this.#checkout = checkout;
    if ((await listProbeFiles(checkout.dir)).length > 0) {
      throw new Error("Directory-sync stress probes already exist");
    }

    const originalHead = await checkout.output(["rev-parse", "HEAD"]);
    this.#originalTree = await checkout.output(["rev-parse", "HEAD^{tree}"]);
    this.#initialContainerState = await this.#readContainerState();

    const baseline = await this.#monitor.waitForHealthSnapshot(60_000);
    if (!baseline) {
      throw new Error("Smoke health was unavailable before stress testing");
    }

    this.#backupBranch = `ops/directory-sync-stress-backup-${this.#options.runId}`;
    await checkout.run([
      "push",
      "origin",
      `HEAD:refs/heads/${this.#backupBranch}`,
    ]);
    await this.#monitor.discoverEndpoints();
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
    this.#monitor.start();
  }

  async executePhase(
    phase: DirectorySyncStressPhase,
    baseline: StressBaseline,
  ): Promise<StressPhaseResult> {
    this.#assertPrepared();
    const checkout = this.#checkout;
    if (!checkout) {
      throw new Error("Directory-sync stress checkout is not prepared");
    }
    await checkout.sync();
    const healthSampleOffset = this.#monitor.healthSamples.length;
    const started = this.#options.now().getTime();
    const queueBefore = await this.#readQueueSnapshot();
    if (queueBefore?.pending !== 0 || queueBefore.processing !== 0) {
      return failedPhase(
        phase,
        "health did not provide a drained queue before the phase",
      );
    }

    await applyDirectorySyncStressPhase(checkout.dir, phase);
    await checkout.commitAll(`test(directory-sync): stress ${phase.id}`);
    await checkout.pushMainWithRebase();
    const pushedAt = this.#options.now().getTime();
    const commit = await checkout.output(["rev-parse", "HEAD"]);
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
      const snapshot = await this.#monitor.waitForStableEntityBaseline(
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
      const snapshot = await this.#monitor.waitForEntityBaseline(
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

    const expectedImportJobs =
      phase.operation === "delete" ? 0 : Math.ceil(phase.count / 50);
    const queueDrained = await this.#waitForQueueDrain(
      queueBefore.completedImports + expectedImportJobs,
      20 * 60_000,
    );
    if (!queueDrained) {
      return failedPhase(
        phase,
        `health did not observe ${expectedImportJobs} completed import job(s) with a drained queue`,
        commitLatencyMs,
        persistenceLatencyMs,
      );
    }

    const healthFailure = this.#monitor.healthSamples
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
    const checkout = this.#checkout;
    if (!checkout) {
      return {
        success: false,
        probesRemaining: 0,
        error: "stress checkout was not prepared",
      };
    }

    try {
      await checkout.sync(true);
      const removed = await removeProbeFiles(checkout.dir);
      if (removed > 0) {
        await checkout.commitAll("test(directory-sync): remove stress probes");
        await checkout.pushMainWithRebase();
      }

      const probesRemaining = (await listProbeFiles(checkout.dir)).length;
      this.#monitor.markGateEnd();
      const finalSnapshot = await this.#monitor.waitForEntityBaseline(
        baseline.notes,
        baseline.entities,
        20 * 60_000,
      );
      await checkout.sync(true);
      const finalTree = await checkout.output(["rev-parse", "HEAD^{tree}"]);
      const contentTreeRestored = finalTree === this.#originalTree;
      const success =
        probesRemaining === 0 &&
        finalSnapshot !== undefined &&
        contentTreeRestored;
      if (success && this.#backupBranch) {
        const deletion = await checkout.run(
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
        probesRemaining: (await listProbeFiles(checkout.dir)).length,
        error: getErrorMessage(error),
      };
    }
  }

  async stopMonitoring(): Promise<StressMetrics> {
    await this.#monitor.stop();
    await writeFile(
      join(this.#options.artifactsDir, "health-samples.json"),
      `${JSON.stringify(this.#monitor.healthSamples, null, 2)}\n`,
    );
    let externalAiCalls = 0;
    if (this.#container && this.#monitor.startedAt) {
      const logs = await this.#ssh(
        ["docker", "logs", "--since", this.#monitor.startedAt, this.#container],
        false,
      );
      const runtimeLog = `${logs.stdout}${logs.stderr}`;
      externalAiCalls = runtimeLog.match(/\] ai:usage \{/g)?.length ?? 0;
      await writeFile(
        join(this.#options.artifactsDir, "runtime.log"),
        runtimeLog,
      );
    }
    const container = await this.#readContainerState();
    const metrics: StressMetrics = {
      health: this.#monitor.gateHealthSamples(),
      runtime: [...this.#monitor.runtimeSamples],
      externalAiCalls,
      ...(container ? { container } : {}),
    };
    if (this.#monitor.error) {
      throw this.#monitor.error;
    }
    return metrics;
  }

  async dispose(): Promise<void> {
    await this.#monitor.stop();
    if (this.#temporaryRoot) {
      await rm(this.#temporaryRoot, { recursive: true, force: true });
    }
  }

  /**
   * Observed container state, or undefined when this run has no container.
   *
   * Every container acceptance check (OOM, restarts, stopped status) reads the
   * observation this returns, and skips itself when there is none. So "no
   * container to inspect" and "could not inspect the container" must not both
   * answer undefined: the second would let an OOM-killed run report success.
   * Only the first is undefined; a failed read raises.
   */
  async #readContainerState(): Promise<InspectedContainerState | undefined> {
    if (!this.#container) return undefined;
    const result = await this.#ssh(
      ["docker", "inspect", this.#container],
      false,
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `docker inspect ${this.#container} exited with code ${result.exitCode}`,
      );
    }

    let inspections;
    try {
      inspections = z
        .array(
          z.object({
            RestartCount: z.number().int().nonnegative(),
            State: z.object({
              Status: z.string(),
              OOMKilled: z.boolean(),
              StartedAt: z.string().min(1),
            }),
          }),
        )
        .parse(JSON.parse(result.stdout));
    } catch (error) {
      throw new Error(
        `Could not read docker inspect output for ${this.#container}`,
        { cause: error },
      );
    }

    const inspection = inspections[0];
    if (!inspection) {
      throw new Error(`docker inspect reported no such container`);
    }

    const reportedRestarts = Math.max(
      0,
      inspection.RestartCount -
        (this.#initialContainerState?.restartCount ?? 0),
    );
    const manuallyRestarted =
      this.#initialContainerState !== undefined &&
      inspection.State.StartedAt !== this.#initialContainerState.startedAt;
    return {
      status: inspection.State.Status,
      restartCount: Math.max(reportedRestarts, manuallyRestarted ? 1 : 0),
      oomKilled:
        inspection.State.OOMKilled &&
        !(this.#initialContainerState?.oomKilled ?? false),
      startedAt: inspection.State.StartedAt,
    };
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

  /**
   * A queue reading, or undefined when the endpoint is momentarily unreachable.
   *
   * Callers poll this, so a request that fails or answers non-2xx is a normal
   * "not yet" and returns undefined. A body we cannot parse is different: the
   * endpoint answered and its shape is not what we expect, which would
   * otherwise present as a queue that never drains until the poll times out.
   */
  async #readQueueSnapshot(): Promise<StressQueueSnapshot | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let body: unknown;
    try {
      const response = await this.#options.fetchImpl(
        `https://${this.#options.user.domain}/health/operate`,
        { method: "GET", signal: controller.signal },
      );
      if (!response.ok) return undefined;
      body = await response.json();
    } catch {
      // Transport failure while polling: the caller retries. Only an
      // unparseable body raises, which the doc comment above explains.
      return undefined;
    } finally {
      clearTimeout(timeout);
    }

    const parsed = stressQueueHealthPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        `Unexpected /health/operate payload from ${this.#options.user.domain}`,
        { cause: parsed.error },
      );
    }

    const completedImports = parsed.data.resources.queue.byType
      .filter(
        (entry) =>
          entry.type === "directory-sync:directory-import" &&
          entry.status === "completed",
      )
      .reduce((total, entry) => total + entry.count, 0);
    return {
      pending: parsed.data.resources.queue.totals.pending,
      processing: parsed.data.resources.queue.totals.processing,
      completedImports,
    };
  }

  async #waitForQueueDrain(
    minimumCompletedImports: number,
    timeoutMs: number,
  ): Promise<boolean> {
    const started = this.#options.now().getTime();
    let consecutiveMatches = 0;
    while (this.#options.now().getTime() - started < timeoutMs) {
      const queue = await this.#readQueueSnapshot();
      if (
        queue?.pending === 0 &&
        queue.processing === 0 &&
        queue.completedImports >= minimumCompletedImports
      ) {
        consecutiveMatches += 1;
        if (consecutiveMatches === 2) return true;
      } else {
        consecutiveMatches = 0;
      }
      await this.#options.sleep(5_000);
    }
    return false;
  }

  async #sampleRuntime(): Promise<StressRuntimeSample | undefined> {
    const container = this.#container;
    if (!container) {
      throw new Error("Directory-sync stress container is not prepared");
    }
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
    return parseStressRuntimeSample(
      result.stdout.trim(),
      this.#options.now().toISOString(),
    );
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
      !this.#checkout ||
      !this.#sshKeyPath ||
      !this.#knownHostsPath ||
      !this.#serverIp ||
      !this.#container
    ) {
      throw new Error("Directory-sync stress driver is not prepared");
    }
  }
}

function assertHermeticDirectorySyncPosture(user: ResolvedUser): void {
  if (user.embeddingEnabled !== false) {
    throw new Error(
      "Directory-sync stress requires embeddingEnabled: false for a hermetic smoke workload",
    );
  }
  if (user.topicExtractionEnabled !== false) {
    throw new Error(
      "Directory-sync stress requires topicExtractionEnabled: false for a hermetic smoke workload",
    );
  }
  if (user.skillDerivationEnabled !== false) {
    throw new Error(
      "Directory-sync stress requires skillDerivationEnabled: false for a hermetic smoke workload",
    );
  }
  if (user.swotDerivationEnabled !== false) {
    throw new Error(
      "Directory-sync stress requires swotDerivationEnabled: false for a hermetic smoke workload",
    );
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
    `- External AI calls: ${result.report.metrics.externalAiCalls ?? 0}`,
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
