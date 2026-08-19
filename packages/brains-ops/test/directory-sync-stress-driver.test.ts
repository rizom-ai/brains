import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveDirectorySyncStressPlan } from "../src/directory-sync-stress";
import {
  cleanupDirectorySyncStress,
  listProbeFiles,
  runDeployedDirectorySyncStress,
  verifyDirectorySyncStressAccess,
  type DeployedDirectorySyncStressResult,
  type StressCommandOptions,
  type StressCommandResult,
  type StressCommandRunner,
} from "../src/directory-sync-stress-system";

interface CommandCall {
  command: string;
  args: string[];
  cwd?: string;
  contentGitTokenConfigured?: boolean;
}

interface ScriptedSystemOptions {
  warmupFailures?: number;
  renameNoteCounts?: number[];
  rejectRuntimeMonitor?: boolean;
  runtimeLog?: string;
  containerStartedAt?: string[];
  queueNeverAdvances?: boolean;
}

const environment = {
  HCLOUD_TOKEN: "test-hcloud-token",
  KAMAL_SSH_PRIVATE_KEY: "test-private-key",
  CONTENT_REPO_ADMIN_TOKEN: "test-content-token",
};

async function createSmokePilotRepo(): Promise<string> {
  const root = await createTempDir("brains-ops-stress-driver-");
  const files = {
    "pilot.yaml": `brainVersion: 0.2.0-alpha.253
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
    "users/smoke.yaml": `handle: smoke
embeddingEnabled: false
topicExtractionEnabled: false
skillDerivationEnabled: false
swotDerivationEnabled: false
discord:
  enabled: false
`,
    "cohorts/smoke.yaml": `members:
  - smoke
`,
  } satisfies Record<string, string>;

  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

class ScriptedStressSystem {
  readonly calls: CommandCall[] = [];
  readonly options: ScriptedSystemOptions;
  checkoutDir: string | undefined;
  healthPayloadCalls = 0;
  renamePayloadReads = 0;
  private clockMs = Date.parse("2026-08-06T06:00:00.000Z");
  private revParseHeadCalls = 0;
  private containerInspectCalls = 0;
  private remainingWarmupFailures: number;
  private renameNoteCounts: number[];
  private completedImports = 0;

  constructor(options: ScriptedSystemOptions = {}) {
    this.options = options;
    this.remainingWarmupFailures = options.warmupFailures ?? 0;
    this.renameNoteCounts = [...(options.renameNoteCounts ?? [])];
  }

  now = (): Date => new Date(this.clockMs);

  // Virtual-time scheduler. The driver runs concurrent loops (settle polling,
  // health monitor, runtime monitor) that share this clock; advancing it at
  // sleep() call time would let event-loop scheduling decide which loop gets
  // the settle window's virtual time. Instead sleepers park with a wake time
  // and a single advancer wakes them in wake-time order, pausing while any
  // scripted fetch or command is in flight so I/O takes zero virtual time.
  private sleepers: Array<{
    wakeAt: number;
    seq: number;
    resolve: () => void;
  }> = [];
  private sleeperSeq = 0;
  private advancing = false;
  private inflight = 0;

  sleep = (milliseconds: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      this.sleepers.push({
        wakeAt: this.clockMs + milliseconds,
        seq: this.sleeperSeq++,
        resolve,
      });
      void this.advanceClock();
    });
  };

  private async advanceClock(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    try {
      while (this.sleepers.length > 0) {
        // Let every runnable continuation execute and park before time moves.
        await Bun.sleep(0);
        if (this.inflight > 0) continue;
        const next = this.sleepers.reduce((a, b) =>
          b.wakeAt < a.wakeAt || (b.wakeAt === a.wakeAt && b.seq < a.seq)
            ? b
            : a,
        );
        this.sleepers.splice(this.sleepers.indexOf(next), 1);
        this.clockMs = Math.max(this.clockMs, next.wakeAt);
        next.resolve();
      }
    } finally {
      this.advancing = false;
    }
  }

  fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    this.inflight += 1;
    try {
      return await this.fetchScripted(input, init);
    } finally {
      this.inflight -= 1;
    }
  };

  private fetchScripted = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.hostname === "api.hetzner.cloud") {
      return Response.json({
        servers: [
          {
            id: 1,
            status: "running",
            public_net: { ipv4: { ip: "203.0.113.10" } },
          },
        ],
      });
    }
    if (
      url.pathname !== "/health/live" &&
      url.pathname !== "/health/ready" &&
      url.pathname !== "/health/operate"
    ) {
      return new Response("not found", { status: 404 });
    }

    const isPayloadPoll = init?.method !== "GET";
    if (isPayloadPoll) {
      this.healthPayloadCalls += 1;
      if (this.remainingWarmupFailures > 0) {
        this.remainingWarmupFailures -= 1;
        return new Response("unavailable", { status: 503 });
      }
    }

    const probes = this.checkoutDir
      ? await listProbeFiles(this.checkoutDir)
      : [];
    let probeNotes = probes.length;
    if (
      isPayloadPoll &&
      probes.some((file) => file.includes("stress-renamed-")) &&
      this.options.renameNoteCounts !== undefined
    ) {
      this.renamePayloadReads += 1;
      probeNotes =
        this.renameNoteCounts.shift() ??
        this.options.renameNoteCounts.at(-1) ??
        probes.length;
    }
    return Response.json({
      status: "ready",
      operationalStatus: "operational",
      app: {
        version: "0.2.0-alpha.253",
        entities: 41 + probeNotes,
        entityCounts: [{ entityType: "note", count: 7 + probeNotes }],
      },
      resources: {
        queue: {
          totals: { pending: 0, processing: 0 },
          byType: [
            {
              type: "directory-sync:directory-import",
              status: "completed",
              count: this.completedImports,
            },
          ],
        },
      },
    });
  };

  commandRunner: StressCommandRunner = async (
    command: string,
    args: readonly string[],
    commandOptions?: StressCommandOptions,
  ): Promise<StressCommandResult> => {
    this.inflight += 1;
    try {
      return await this.runScriptedCommand(command, args, commandOptions);
    } finally {
      this.inflight -= 1;
    }
  };

  private runScriptedCommand = async (
    command: string,
    args: readonly string[],
    commandOptions?: StressCommandOptions,
  ): Promise<StressCommandResult> => {
    const call = {
      command,
      args: [...args],
      ...(commandOptions?.cwd ? { cwd: commandOptions.cwd } : {}),
      ...(command === "git"
        ? {
            contentGitTokenConfigured:
              commandOptions?.env?.["GH_TOKEN"] ===
                environment.CONTENT_REPO_ADMIN_TOKEN &&
              commandOptions.env["GITHUB_TOKEN"] ===
                environment.CONTENT_REPO_ADMIN_TOKEN,
          }
        : {}),
    };
    this.calls.push(call);

    if (command === "ssh-keyscan") {
      return ok("smoke ssh-ed25519 AAAATEST\n");
    }
    if (command === "git" && args.includes("clone")) {
      const checkoutDir = args.at(-1);
      if (!checkoutDir) throw new Error("Missing scripted checkout path");
      this.checkoutDir = checkoutDir;
      await mkdir(checkoutDir, { recursive: true });
      await writeFile(join(checkoutDir, "keep.md"), "baseline\n");
      return ok();
    }
    if (command === "git") {
      if (
        args[0] === "push" &&
        args[1] === "origin" &&
        args[2] === "main" &&
        !this.options.queueNeverAdvances
      ) {
        this.completedImports += 100;
      }
      if (args[0] === "rev-parse" && args[1] === "HEAD^{tree}") {
        return ok("baseline-tree\n");
      }
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        const value =
          this.revParseHeadCalls === 0
            ? "baseline-head"
            : `phase-commit-${this.revParseHeadCalls}`;
        this.revParseHeadCalls += 1;
        return ok(`${value}\n`);
      }
      return ok();
    }
    if (command === "ssh") {
      const hostIndex = args.findIndex((arg) => arg.startsWith("root@"));
      const remote = args.slice(hostIndex + 1);
      if (remote[0] === "docker" && remote[1] === "ps") {
        return ok("rover-web-smoke\n");
      }
      if (remote[0] === "docker" && remote[1] === "inspect") {
        const startedAt =
          this.options.containerStartedAt?.[
            Math.min(
              this.containerInspectCalls,
              this.options.containerStartedAt.length - 1,
            )
          ] ?? "2026-08-06T05:59:00.000Z";
        this.containerInspectCalls += 1;
        return ok(
          `${JSON.stringify([
            {
              RestartCount: 0,
              State: {
                Status: "running",
                OOMKilled: false,
                StartedAt: startedAt,
              },
            },
          ])}\n`,
        );
      }
      if (remote.includes("stats")) {
        if (this.options.rejectRuntimeMonitor) {
          throw new Error("ssh spawn failed");
        }
        return ok("4.25%,12.50%,17\n");
      }
      if (remote[0] === "docker" && remote[1] === "logs") {
        return ok(this.options.runtimeLog ?? "runtime evidence\n");
      }
      if (remote[0] === "docker" && remote[1] === "exec") {
        return ok();
      }
      return ok();
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
}

function ok(stdout = ""): StressCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

async function runScriptedProfile(
  profile: "regression" | "load",
  system: ScriptedStressSystem,
): Promise<{
  rootDir: string;
  artifactsDir: string;
  result: DeployedDirectorySyncStressResult;
}> {
  const rootDir = await createSmokePilotRepo();
  const artifactsDir = join(rootDir, "artifacts");
  const result = await runDeployedDirectorySyncStress({
    rootDir,
    handle: "smoke",
    profile,
    confirmation: "stress:smoke",
    artifactsDir,
    env: environment,
    fetchImpl: system.fetchImpl,
    commandRunner: system.commandRunner,
    now: system.now,
    sleep: system.sleep,
    logger() {},
  });
  return { rootDir, artifactsDir, result };
}

function relevantGitAndSshCalls(calls: CommandCall[]): string[] {
  return calls.flatMap((call) => {
    if (call.command === "git") {
      return [`git ${call.args.join(" ")}`];
    }
    if (call.command !== "ssh") return [];
    const hostIndex = call.args.findIndex((arg) => arg.startsWith("root@"));
    const remote = call.args.slice(hostIndex + 1);
    if (remote.includes("stats")) return [];
    return [`ssh ${remote.join(" ")}`];
  });
}

describe("deployed directory-sync stress driver", () => {
  it("verifies the exact content credential path without writing a remote ref", async () => {
    const system = new ScriptedStressSystem();
    const rootDir = await createSmokePilotRepo();
    const artifactsDir = join(rootDir, "access-artifacts");

    const result = await verifyDirectorySyncStressAccess({
      rootDir,
      handle: "smoke",
      confirmation: "stress:smoke",
      artifactsDir,
      env: environment,
      commandRunner: system.commandRunner,
      now: system.now,
    });

    expect(result).toMatchObject({
      success: true,
      artifactsDir,
      target: {
        handle: "smoke",
        domain: "smoke.rizom.ai",
        contentRepo: "rizom-ai/rover-smoke-content",
      },
      remoteHead: "baseline-head",
    });
    expect(
      JSON.parse(
        await readFile(join(artifactsDir, "access-check.json"), "utf8"),
      ),
    ).toMatchObject({ success: true, remoteHead: "baseline-head" });

    const clone = system.calls.find(
      (call) => call.command === "git" && call.args.includes("clone"),
    );
    expect(clone?.contentGitTokenConfigured).toBe(true);
    const pushes = system.calls.filter(
      (call) => call.command === "git" && call.args[0] === "push",
    );
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.args).toEqual([
      "push",
      "--dry-run",
      "origin",
      "HEAD:refs/heads/ops/directory-sync-stress-access-check-20260806060000",
    ]);
  });

  it("runs the real prepare, monitor, phase, cleanup, and evidence lifecycle", async () => {
    const system = new ScriptedStressSystem();
    const { artifactsDir, result } = await runScriptedProfile(
      "regression",
      system,
    );

    expect(result.report.success).toBe(true);
    expect(result.report.phases.map((phase) => phase.id)).toEqual([
      "add20",
      "update20",
      "delete20",
    ]);
    expect(result.report.cleanup).toMatchObject({
      success: true,
      probesRemaining: 0,
      contentTreeRestored: true,
    });
    expect(result.report.metrics.runtime.length).toBeGreaterThan(0);
    expect(await readFile(join(artifactsDir, "runtime.log"), "utf8")).toBe(
      "runtime evidence\n",
    );
    expect(await readFile(join(artifactsDir, "report.json"), "utf8")).toContain(
      '"success": true',
    );

    expect(system.calls.some((call) => call.command === "gh")).toBe(false);
    const clone = system.calls.find(
      (call) => call.command === "git" && call.args.includes("clone"),
    );
    expect(clone?.args).toContain(
      "https://github.com/rizom-ai/rover-smoke-content.git",
    );
    expect(clone?.args.join(" ")).not.toContain("test-content-token");
    expect(clone?.contentGitTokenConfigured).toBe(true);

    const commands = relevantGitAndSshCalls(system.calls);
    expect(commands).toContain(
      "git push origin HEAD:refs/heads/ops/directory-sync-stress-backup-20260806060000",
    );
    expect(
      commands.filter((command) => command === "git push origin main"),
    ).toHaveLength(3);
    expect(
      commands.filter((command) =>
        command.startsWith(
          "ssh docker exec rover-web-smoke git -C /app/brain-data merge-base --is-ancestor phase-commit-",
        ),
      ),
    ).toHaveLength(3);
    const backupDeletionIndex = commands.indexOf(
      "git push origin --delete ops/directory-sync-stress-backup-20260806060000",
    );
    const runtimeLogsIndex = commands.indexOf(
      "ssh docker logs --since 2026-08-06T06:00:00.000Z rover-web-smoke",
    );
    expect(backupDeletionIndex).toBeGreaterThan(-1);
    expect(runtimeLogsIndex).toBeGreaterThan(backupDeletionIndex);
  });

  it("requires durable import completion and queue drain for each phase", async () => {
    const system = new ScriptedStressSystem({ queueNeverAdvances: true });
    const { result } = await runScriptedProfile("regression", system);

    expect(result.report.success).toBe(false);
    expect(result.report.failure).toContain(
      "add20: health did not observe 1 completed import job(s) with a drained queue",
    );
    expect(result.report.phases.map((phase) => phase.id)).toEqual(["add20"]);
  });

  it("detects a watchdog restart even when Docker RestartCount stays zero", async () => {
    const system = new ScriptedStressSystem({
      containerStartedAt: [
        "2026-08-06T05:59:00.000Z",
        "2026-08-06T06:05:00.000Z",
      ],
    });
    const { result } = await runScriptedProfile("regression", system);

    expect(result.report.success).toBe(false);
    expect(result.report.failure).toBe("container: restarted 1 time(s)");
    expect(result.report.metrics.container?.restartCount).toBe(1);
  });

  it("fails the hermetic gate when runtime logs contain external AI usage", async () => {
    const system = new ScriptedStressSystem({
      runtimeLog:
        "[2026-08-06T06:01:00.000Z] [EmbeddingJobHandler] ai:usage {\n",
    });
    const { result } = await runScriptedProfile("regression", system);

    expect(result.report.success).toBe(false);
    expect(result.report.failure).toBe("external AI: observed 1 call(s)");
    expect(result.report.metrics.externalAiCalls).toBe(1);
  });

  it("refuses a deployed stress run without the hermetic smoke posture", async () => {
    const system = new ScriptedStressSystem();
    const rootDir = await createSmokePilotRepo();
    await writeFile(
      join(rootDir, "users", "smoke.yaml"),
      "handle: smoke\ndiscord:\n  enabled: false\n",
    );

    expect(
      runDeployedDirectorySyncStress({
        rootDir,
        handle: "smoke",
        profile: "regression",
        confirmation: "stress:smoke",
        env: environment,
        fetchImpl: system.fetchImpl,
        commandRunner: system.commandRunner,
        now: system.now,
        sleep: system.sleep,
        logger() {},
      }),
    ).rejects.toThrow("requires embeddingEnabled: false");
  });

  it("refuses a nominally hermetic run with AI-backed derivations enabled", async () => {
    const system = new ScriptedStressSystem();
    const rootDir = await createSmokePilotRepo();
    await writeFile(
      join(rootDir, "users", "smoke.yaml"),
      `handle: smoke
embeddingEnabled: false
topicExtractionEnabled: false
skillDerivationEnabled: false
swotDerivationEnabled: true
discord:
  enabled: false
`,
    );

    expect(
      runDeployedDirectorySyncStress({
        rootDir,
        handle: "smoke",
        profile: "regression",
        confirmation: "stress:smoke",
        env: environment,
        fetchImpl: system.fetchImpl,
        commandRunner: system.commandRunner,
        now: system.now,
        sleep: system.sleep,
        logger() {},
      }),
    ).rejects.toThrow("requires swotDerivationEnabled: false");
  });

  it("allows feature-enabled smoke only with an explicit external AI cap", async () => {
    const system = new ScriptedStressSystem({
      runtimeLog:
        "[2026-08-06T06:01:00.000Z] [EmbeddingJobHandler] ai:usage {\n",
    });
    const rootDir = await createSmokePilotRepo();
    await writeFile(
      join(rootDir, "users", "smoke.yaml"),
      "handle: smoke\ndiscord:\n  enabled: false\n",
    );
    const plan = resolveDirectorySyncStressPlan("regression");
    plan.maximumExternalAiCalls = 1;

    const result = await runDeployedDirectorySyncStress({
      rootDir,
      handle: "smoke",
      profile: "regression",
      plan,
      confirmation: "stress:smoke",
      env: environment,
      fetchImpl: system.fetchImpl,
      commandRunner: system.commandRunner,
      now: system.now,
      sleep: system.sleep,
      logger() {},
    });

    expect(result.report.success).toBe(true);
    expect(result.report.metrics.externalAiCalls).toBe(1);
  });

  it("excludes tolerated warmup failures from the gate but preserves them as evidence", async () => {
    const system = new ScriptedStressSystem({ warmupFailures: 1 });
    const { artifactsDir, result } = await runScriptedProfile(
      "regression",
      system,
    );

    expect(result.report.success).toBe(true);
    expect(result.report.metrics.health.every((sample) => sample.ok)).toBe(
      true,
    );
    const allHealth = JSON.parse(
      await readFile(join(artifactsDir, "health-samples.json"), "utf8"),
    ) as Array<{ ok: boolean }>;
    expect(allHealth.some((sample) => !sample.ok)).toBe(true);
  });

  it("does not create a backup branch before the health baseline succeeds", async () => {
    const system = new ScriptedStressSystem({ warmupFailures: 100 });
    const rootDir = await createSmokePilotRepo();

    let failure: unknown;
    try {
      await runDeployedDirectorySyncStress({
        rootDir,
        handle: "smoke",
        profile: "regression",
        confirmation: "stress:smoke",
        artifactsDir: join(rootDir, "artifacts"),
        env: environment,
        fetchImpl: system.fetchImpl,
        commandRunner: system.commandRunner,
        now: system.now,
        sleep: system.sleep,
        logger() {},
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Smoke health was unavailable before stress testing",
    );
    expect(
      system.calls.some((call) =>
        call.args.some((arg) =>
          arg.includes("refs/heads/ops/directory-sync-stress-backup-"),
        ),
      ),
    ).toBe(false);
  });

  it("requires two stable post-settle note counts for rename persistence", async () => {
    const system = new ScriptedStressSystem({
      renameNoteCounts: [350, 351, 350, 350],
    });
    const { result } = await runScriptedProfile("load", system);

    expect(result.report.success).toBe(true);
    expect(system.renamePayloadReads).toBe(4);
    expect(
      result.report.phases.find((phase) => phase.id === "rename100")
        ?.persistenceLatencyMs,
    ).toBeGreaterThanOrEqual(55_000);
  });

  it("fails a rename whose note count never stabilizes", async () => {
    const system = new ScriptedStressSystem({ renameNoteCounts: [351] });
    const { result } = await runScriptedProfile("load", system);

    expect(result.report.success).toBe(false);
    expect(result.report.failure).toContain(
      "rename100: health did not stabilize at 357 notes",
    );
    expect(
      result.report.phases.some((phase) => phase.id === "update350b"),
    ).toBe(false);
  });

  it("reports a runtime monitor rejection without an unhandled rejection", async () => {
    const system = new ScriptedStressSystem({ rejectRuntimeMonitor: true });
    const { result } = await runScriptedProfile("regression", system);

    expect(result.report.success).toBe(false);
    expect(result.report.failure).toBe("monitor: ssh spawn failed");
  });
});

describe("directory-sync stress cleanup", () => {
  it("prunes stale backup branches only after all probes are gone", async () => {
    const rootDir = await createSmokePilotRepo();
    const calls: CommandCall[] = [];
    let checkoutDir = "";
    const runner: StressCommandRunner = async (command, args, options) => {
      calls.push({
        command,
        args: [...args],
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      });
      if (command === "git" && args.includes("clone")) {
        checkoutDir = args.at(-1) ?? "";
        await mkdir(checkoutDir, { recursive: true });
        await writeFile(join(checkoutDir, "keep.md"), "baseline\n");
        return ok();
      }
      if (command === "git" && args[0] === "ls-remote") {
        return ok(
          "abc123\trefs/heads/ops/directory-sync-stress-backup-old-run\n",
        );
      }
      return ok(args[0] === "rev-parse" ? "cleanup-head\n" : "");
    };

    const result = await cleanupDirectorySyncStress({
      rootDir,
      handle: "smoke",
      confirmation: "stress:smoke",
      env: { CONTENT_REPO_ADMIN_TOKEN: "test-content-token" },
      commandRunner: runner,
      logger() {},
    });

    expect(result.backupBranchesDeleted).toEqual([
      "ops/directory-sync-stress-backup-old-run",
    ]);
    expect(
      calls.some(
        (call) =>
          call.args.join(" ") ===
          "push origin --delete ops/directory-sync-stress-backup-old-run",
      ),
    ).toBe(true);
  });

  it("retains backup branches when a probe remains", async () => {
    const rootDir = await createSmokePilotRepo();
    const calls: CommandCall[] = [];
    let checkoutDir = "";
    const runner: StressCommandRunner = async (command, args, options) => {
      calls.push({
        command,
        args: [...args],
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      });
      if (command === "git" && args.includes("clone")) {
        checkoutDir = args.at(-1) ?? "";
        await mkdir(checkoutDir, { recursive: true });
        await writeFile(
          join(checkoutDir, "directory-sync-stress-001.md"),
          "probe\n",
        );
        return ok();
      }
      if (
        command === "git" &&
        args[0] === "push" &&
        args[1] === "origin" &&
        args[2] === "main"
      ) {
        await writeFile(
          join(checkoutDir, "directory-sync-stress-999.md"),
          "residual\n",
        );
      }
      return ok(args[0] === "rev-parse" ? "cleanup-head\n" : "");
    };

    const result = await cleanupDirectorySyncStress({
      rootDir,
      handle: "smoke",
      confirmation: "stress:smoke",
      env: { CONTENT_REPO_ADMIN_TOKEN: "test-content-token" },
      commandRunner: runner,
      logger() {},
    });

    expect(result.success).toBe(false);
    expect(result.probesRemaining).toBe(1);
    expect(result.backupBranchesDeleted).toEqual([]);
    expect(calls.some((call) => call.args[0] === "ls-remote")).toBe(false);
  });
});
