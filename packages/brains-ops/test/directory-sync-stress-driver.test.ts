import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  cleanupDirectorySyncStress,
  listProbeFiles,
  runDeployedDirectorySyncStress,
  type DeployedDirectorySyncStressResult,
  type StressCommandOptions,
  type StressCommandResult,
  type StressCommandRunner,
} from "../src/directory-sync-stress-system";

interface CommandCall {
  command: string;
  args: string[];
  cwd?: string;
}

interface ScriptedSystemOptions {
  warmupFailures?: number;
  renameNoteCounts?: number[];
  rejectRuntimeMonitor?: boolean;
}

const environment = {
  HCLOUD_TOKEN: "test-hcloud-token",
  KAMAL_SSH_PRIVATE_KEY: "test-private-key",
  CONTENT_REPO_ADMIN_TOKEN: "test-content-token",
};

async function createSmokePilotRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-stress-driver-"));
  const files = {
    "pilot.yaml": `brainVersion: 0.2.0-alpha.253
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
  private remainingWarmupFailures: number;
  private renameNoteCounts: number[];

  constructor(options: ScriptedSystemOptions = {}) {
    this.options = options;
    this.remainingWarmupFailures = options.warmupFailures ?? 0;
    this.renameNoteCounts = [...(options.renameNoteCounts ?? [])];
  }

  now = (): Date => new Date(this.clockMs);

  sleep = async (milliseconds: number): Promise<void> => {
    this.clockMs += milliseconds;
    await Bun.sleep(0);
  };

  fetchImpl = async (
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
    if (url.pathname !== "/health") {
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
      status: "ok",
      version: "0.2.0-alpha.253",
      entities: 41 + probeNotes,
      entityCounts: [{ entityType: "note", count: 7 + probeNotes }],
    });
  };

  commandRunner: StressCommandRunner = async (
    command: string,
    args: readonly string[],
    commandOptions?: StressCommandOptions,
  ): Promise<StressCommandResult> => {
    const call = {
      command,
      args: [...args],
      ...(commandOptions?.cwd ? { cwd: commandOptions.cwd } : {}),
    };
    this.calls.push(call);

    if (command === "ssh-keyscan") {
      return ok("smoke ssh-ed25519 AAAATEST\n");
    }
    if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
      const checkoutDir = args[3];
      if (!checkoutDir) throw new Error("Missing scripted checkout path");
      this.checkoutDir = checkoutDir;
      await mkdir(checkoutDir, { recursive: true });
      await writeFile(join(checkoutDir, "keep.md"), "baseline\n");
      return ok();
    }
    if (command === "git") {
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
        return ok(
          `${JSON.stringify([
            {
              RestartCount: 0,
              State: { Status: "running", OOMKilled: false },
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
        return ok("runtime evidence\n");
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
      if (command === "gh") {
        checkoutDir = args[3] ?? "";
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
      if (command === "gh") {
        checkoutDir = args[3] ?? "";
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
