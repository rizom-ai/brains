import { expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const RUN_SOAK =
  process.platform === "linux" && process.env["RUN_IMPORT_BURST_SOAK"] === "1";
const FILE_COUNT = Number(process.env["IMPORT_BURST_FILE_COUNT"] ?? 350);
// One-minute pull cadence plus enough time for 350 targeted delete jobs.
const PULL_TIMEOUT_MS = 150_000;
const HEALTH_TIMEOUT_MS = 1_000;
const MAX_HEALTH_LATENCY_MS = 500;

interface ProcessInfo {
  pid: number;
  parentPid: number;
  state: string;
  name: string;
  command: string;
}

interface HealthMonitor {
  failures: string[];
  maxLatencyMs: number;
  maxPersistentZombies: number;
  stop(): Promise<void>;
}

const ZOMBIE_PERSISTENCE_SAMPLES = 2;

/** Distinguishes a normal wait/reap window from a child left permanently dead. */
class PersistentZombieTracker {
  private consecutiveSamples = new Map<string, number>();

  observe(zombies: ProcessInfo[]): ProcessInfo[] {
    const next = new Map<string, number>();
    const persistent: ProcessInfo[] = [];
    for (const zombie of zombies) {
      const key = `${zombie.pid}/${zombie.parentPid}/${zombie.name}`;
      const count = (this.consecutiveSamples.get(key) ?? 0) + 1;
      next.set(key, count);
      if (count >= ZOMBIE_PERSISTENCE_SAMPLES) persistent.push(zombie);
    }
    this.consecutiveSamples = next;
    return persistent;
  }
}

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`,
    );
  }
  return stdout;
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("reserved") });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a test port");
  return port;
}

async function readProcessTable(): Promise<ProcessInfo[]> {
  const entries = await readdir("/proc", { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map(async (entry): Promise<ProcessInfo | undefined> => {
          try {
            const status = await readFile(`/proc/${entry.name}/status`, "utf8");
            const command = (
              await readFile(`/proc/${entry.name}/cmdline`, "utf8")
            ).replaceAll("\0", " ");
            return {
              pid: Number(entry.name),
              parentPid: Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]),
              state: /^State:\s+(\S)/m.exec(status)?.[1] ?? "?",
              name: /^Name:\s+(.+)$/m.exec(status)?.[1] ?? "unknown",
              command,
            };
          } catch {
            return undefined;
          }
        }),
    )
  ).filter((entry): entry is ProcessInfo => entry !== undefined);
}

async function readDescendants(parentPid: number): Promise<ProcessInfo[]> {
  const processes = await readProcessTable();
  const expand = (pids: ReadonlySet<number>): ReadonlySet<number> => {
    const next = new Set([
      ...pids,
      ...processes
        .filter((processInfo) => pids.has(processInfo.parentPid))
        .map((processInfo) => processInfo.pid),
    ]);
    return next.size === pids.size ? next : expand(next);
  };
  const descendantPids = expand(new Set([parentPid]));
  return processes.filter(
    (processInfo) =>
      processInfo.pid !== parentPid && descendantPids.has(processInfo.pid),
  );
}

/** Recursively poll until the probe yields a value or the deadline passes. */
async function pollUntil<T>(
  deadline: number,
  intervalMs: number,
  probe: () => Promise<T | undefined>,
  onTimeout: () => Error,
): Promise<T> {
  const result = await probe();
  if (result !== undefined) return result;
  if (Date.now() >= deadline) throw onTimeout();
  await Bun.sleep(intervalMs);
  return pollUntil(deadline, intervalMs, probe, onTimeout);
}

async function waitForHealth(
  url: string,
  child: Bun.ReadableSubprocess,
): Promise<void> {
  await pollUntil(
    Date.now() + 60_000,
    250,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(
          `Brain exited before serving health (${child.exitCode})`,
        );
      }
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        return response.ok ? true : undefined;
      } catch {
        // The web child is still starting.
        return undefined;
      }
    },
    () => new Error("Timed out waiting for Brain health"),
  );
}

function startHealthMonitor(
  url: string,
  supervisor: Bun.ReadableSubprocess,
): HealthMonitor {
  let stopped = false;
  const zombieTracker = new PersistentZombieTracker();
  const monitor: HealthMonitor = {
    failures: [],
    maxLatencyMs: 0,
    maxPersistentZombies: 0,
    async stop(): Promise<void> {
      stopped = true;
      await monitoring;
    },
  };
  const sample = async (sampleIndex: number): Promise<void> => {
    if (stopped) return;
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) {
        monitor.failures.push(`HTTP ${response.status}`);
      }
    } catch (error) {
      monitor.failures.push(String(error));
    }
    monitor.maxLatencyMs = Math.max(
      monitor.maxLatencyMs,
      performance.now() - startedAt,
    );

    if (sampleIndex % 4 === 0) {
      const zombies = (await readDescendants(supervisor.pid)).filter(
        (processInfo) => processInfo.state === "Z",
      );
      const persistentZombies = zombieTracker.observe(zombies);
      monitor.maxPersistentZombies = Math.max(
        monitor.maxPersistentZombies,
        persistentZombies.length,
      );
      if (persistentZombies.length > 0) {
        monitor.failures.push(
          `persistent zombie children: ${persistentZombies
            .map(({ pid, parentPid, name }) => `${pid}/${parentPid} ${name}`)
            .join(", ")}`,
        );
      }
    }
    await Bun.sleep(250);
    return sample(sampleIndex + 1);
  };
  const monitoring = sample(0);
  return monitor;
}

async function waitForFileContent(
  path: string,
  expected: string,
  child: Bun.ReadableSubprocess,
): Promise<void> {
  await pollUntil(
    Date.now() + PULL_TIMEOUT_MS,
    250,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`Brain exited during import (${child.exitCode})`);
      }
      try {
        return (await readFile(path, "utf8")).includes(expected)
          ? true
          : undefined;
      } catch {
        // The periodic pull has not materialized the file yet.
        return undefined;
      }
    },
    () => new Error(`Timed out waiting for imported content in ${path}`),
  );
}

async function stopProcessGroup(child: Bun.ReadableSubprocess): Promise<void> {
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(10_000).then(() => false),
  ]);
  if (stopped) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await child.exited;
}

async function commitBurst(
  checkoutDir: string,
  phase: "add" | "update",
): Promise<void> {
  await Promise.all(
    Array.from({ length: FILE_COUNT }, (_, offset) => offset + 1).map(
      async (number) => {
        const index = String(number).padStart(3, "0");
        const path = join(checkoutDir, `directory-sync-stress-${index}.md`);
        if (phase === "add") {
          await writeFile(
            path,
            [
              "---",
              `title: "Directory Sync Stress ${index}"`,
              "---",
              "",
              `Deterministic import-burst probe ${index}.`,
              "",
            ].join("\n"),
          );
        } else {
          const existing = await readFile(path, "utf8");
          await writeFile(
            path,
            `${existing.trimEnd()}\n\nUpdate marker: update.\n`,
          );
        }
      },
    ),
  );
  await run(["git", "add", "-A"], checkoutDir);
  await run(
    [
      "git",
      "-c",
      "user.name=Import Burst Soak",
      "-c",
      "user.email=import-burst@example.com",
      "commit",
      "-m",
      `test(directory-sync): ${phase} import burst`,
    ],
    checkoutDir,
  );
  await run(["git", "push", "origin", "main"], checkoutDir);
}

async function commitProbeCleanup(checkoutDir: string): Promise<void> {
  await Promise.all(
    Array.from({ length: FILE_COUNT }, (_, offset) => offset + 1).map(
      (number) =>
        rm(
          join(
            checkoutDir,
            `directory-sync-stress-${String(number).padStart(3, "0")}.md`,
          ),
        ),
    ),
  );
  await run(["git", "add", "-A"], checkoutDir);
  await run(
    [
      "git",
      "-c",
      "user.name=Import Burst Soak",
      "-c",
      "user.email=import-burst@example.com",
      "commit",
      "-m",
      "test(directory-sync): remove import burst",
    ],
    checkoutDir,
  );
  await run(["git", "push", "origin", "main"], checkoutDir);
}

function countNotes(databasePath: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database
      .query<{ count: number }, []>(
        "select count(*) as count from entities where \"entityType\" = 'note'",
      )
      .get();
    return row?.count ?? 0;
  } finally {
    database.close();
  }
}

async function waitForCleanup(
  brainDataDir: string,
  databasePath: string,
  baselineNoteCount: number,
  child: Bun.ReadableSubprocess,
): Promise<void> {
  await pollUntil(
    Date.now() + PULL_TIMEOUT_MS,
    250,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`Brain exited during cleanup (${child.exitCode})`);
      }
      try {
        const files = await readdir(brainDataDir);
        if (files.some((file) => file.startsWith("directory-sync-stress-"))) {
          return undefined;
        }
        if (countNotes(databasePath) !== baselineNoteCount) return undefined;
        const diff = await run(
          ["git", "diff", "--name-only", "origin/main", "--"],
          brainDataDir,
        );
        const probeDiffs = diff
          .split("\n")
          .filter((path) => path.startsWith("directory-sync-stress-"));
        return probeDiffs.length === 0 ? true : undefined;
      } catch {
        return undefined;
      }
    },
    () => new Error("Timed out waiting for remote cleanup convergence"),
  );
}

/**
 * Manual Linux soak using the packaged, supervised web + worker runtime:
 *
 * RUN_IMPORT_BURST_SOAK=1 bun test \
 *   packages/brain-cli/test/import-burst-stability.test.ts
 */
it.skipIf(!RUN_SOAK)(
  "keeps the web responsive and remote deletions authoritative across an import burst",
  async () => {
    expect(Number.isInteger(FILE_COUNT) && FILE_COUNT > 0).toBe(true);

    const root = await mkdtemp(join(tmpdir(), "import-burst-soak-"));
    const appDir = join(root, "app");
    const remoteDir = join(root, "remote.git");
    const writerDir = join(root, "writer");
    const brainEntrypoint = join(import.meta.dir, "..", "dist", "brain.js");
    await mkdir(appDir);
    await mkdir(writerDir);

    let supervisor: Bun.ReadableSubprocess | undefined;
    let stdout: Promise<string> | undefined;
    let stderr: Promise<string> | undefined;
    let monitor: HealthMonitor | undefined;
    let failure: unknown;

    try {
      await run(
        ["git", "init", "--bare", "--initial-branch=main", remoteDir],
        root,
      );
      await run(["git", "init", "--initial-branch=main"], writerDir);
      await writeFile(
        join(writerDir, "keep.md"),
        '---\ntitle: "Import Burst Baseline"\n---\n\nbaseline\n',
      );
      await run(["git", "add", "-A"], writerDir);
      await run(
        [
          "git",
          "-c",
          "user.name=Import Burst Soak",
          "-c",
          "user.email=import-burst@example.com",
          "commit",
          "-m",
          "test(directory-sync): seed import burst remote",
        ],
        writerDir,
      );
      await run(["git", "remote", "add", "origin", remoteDir], writerDir);
      await run(["git", "push", "origin", "main"], writerDir);

      const [productionPort, apiPort, previewPort] = await Promise.all([
        reservePort(),
        reservePort(),
        reservePort(),
      ]);
      await writeFile(
        join(appDir, "brain.yaml"),
        `brain: brain
anchor: person
kind: professional
bundles: [core]
embedding:
  enabled: false
remove:
  - a2a
  - chat
  - email
  - mcp
  - onboarding
  - web-chat
plugins:
  topics:
    enableAutoExtraction: false
  directory-sync:
    autoSync: true
    initialSync: true
    seedContent: false
    syncInterval: 1
    git:
      gitUrl: file://${remoteDir}
      bootstrapFromSeed: false
  webserver:
    productionPort: ${productionPort}
    apiPort: ${apiPort}
    previewPort: ${previewPort}
`,
      );

      supervisor = Bun.spawn(["bun", brainEntrypoint, "start"], {
        cwd: appDir,
        detached: true,
        env: {
          ...process.env,
          AI_API_KEY: "import-burst-soak-key",
          NO_COLOR: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      stdout = new Response(supervisor.stdout).text();
      stderr = new Response(supervisor.stderr).text();

      const healthUrl = `http://127.0.0.1:${productionPort}/health/live`;
      await waitForHealth(healthUrl, supervisor);
      // The worker child boots a few seconds after web first serves health.
      const supervisorPid = supervisor.pid;
      const roles = await pollUntil(
        Date.now() + 30_000,
        500,
        async () => {
          const found = (await readDescendants(supervisorPid))
            .map(({ command }) => command.match(/--child=(web|worker)/)?.[1])
            .filter((role): role is string => role !== undefined)
            .sort();
          return found.includes("web") && found.includes("worker")
            ? found
            : undefined;
        },
        () => new Error("Timed out waiting for web and worker children"),
      );
      expect(roles).toEqual(["web", "worker"]);

      const databasePath = join(appDir, "data", "brain.db");
      const baselineNoteCount = await pollUntil(
        Date.now() + 30_000,
        250,
        async () => {
          try {
            const count = countNotes(databasePath);
            return count > 0 ? count : undefined;
          } catch {
            return undefined;
          }
        },
        () => new Error("Timed out waiting for baseline note import"),
      );

      monitor = startHealthMonitor(healthUrl, supervisor);
      await commitBurst(writerDir, "add");
      const finalProbePath = join(
        appDir,
        "brain-data",
        `directory-sync-stress-${String(FILE_COUNT).padStart(3, "0")}.md`,
      );
      await waitForFileContent(
        finalProbePath,
        "Deterministic import-burst probe",
        supervisor,
      );
      await Bun.sleep(10_000);

      await commitBurst(writerDir, "update");
      await waitForFileContent(
        finalProbePath,
        "Update marker: update.",
        supervisor,
      );

      // Delete the remote probes while import-triggered entity churn can still
      // be in flight. Remote deletion must remain authoritative over late
      // entity updates and auto-export.
      await commitProbeCleanup(writerDir);
      const brainDataDir = join(appDir, "brain-data");
      await waitForCleanup(
        brainDataDir,
        databasePath,
        baselineNoteCount,
        supervisor,
      );
      await Bun.sleep(10_000);
      await waitForCleanup(
        brainDataDir,
        databasePath,
        baselineNoteCount,
        supervisor,
      );
      await monitor.stop();

      expect(monitor.failures).toEqual([]);
      expect(monitor.maxPersistentZombies).toBe(0);
      expect(monitor.maxLatencyMs).toBeLessThan(MAX_HEALTH_LATENCY_MS);
    } catch (error) {
      failure = error;
    } finally {
      await monitor?.stop();
      if (supervisor) await stopProcessGroup(supervisor);
      const logs = [await stdout, await stderr].filter(Boolean).join("\n");
      if (failure) {
        await writeFile(join(root, "runtime.log"), logs);
        failure = new Error(
          `${String(failure)}\nImport-burst evidence retained at ${root}\n${logs.slice(-12_000)}`,
          { cause: failure },
        );
      } else {
        await rm(root, { recursive: true, force: true });
      }
    }

    if (failure) throw failure;
  },
  360_000,
);

it("ignores a transient zombie that is reaped before the next sample", () => {
  const tracker = new PersistentZombieTracker();
  const zombie: ProcessInfo = {
    pid: 101,
    parentPid: 100,
    state: "Z",
    name: "sh",
    command: "",
  };

  expect(tracker.observe([zombie])).toEqual([]);
  expect(tracker.observe([])).toEqual([]);
  expect(tracker.observe([zombie])).toEqual([]);
});

it("reports the same zombie when it survives consecutive samples", () => {
  const tracker = new PersistentZombieTracker();
  const zombie: ProcessInfo = {
    pid: 101,
    parentPid: 100,
    state: "Z",
    name: "git",
    command: "",
  };

  expect(tracker.observe([zombie])).toEqual([]);
  expect(tracker.observe([zombie])).toEqual([zombie]);
});

it("runs the packaged import-burst soak nightly in one isolated CI job", async () => {
  const repoRoot = join(import.meta.dir, "..", "..", "..");
  const workflow = await readFile(
    join(repoRoot, ".github", "workflows", "directory-sync-import-soak.yml"),
    "utf8",
  );

  expect(workflow).toContain("schedule:");
  expect(workflow).toContain("cron:");
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("group: directory-sync-import-soak");
  expect(workflow).toContain("RUN_IMPORT_BURST_SOAK: 1");
  expect(workflow).toContain("IMPORT_BURST_FILE_COUNT: 350");
  expect(workflow).toContain("bunx turbo run build --filter=@rizom/brain");
  expect(workflow).toContain(
    "bun test packages/brain-cli/test/import-burst-stability.test.ts",
  );
  expect(workflow).toContain("set -o pipefail");
  expect(workflow).toContain("issues: write");
  expect(workflow).toContain("if: failure()");
  expect(workflow).not.toContain("matrix:");
});
