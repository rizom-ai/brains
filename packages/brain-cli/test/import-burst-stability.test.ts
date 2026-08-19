import { expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const RUN_SOAK =
  process.platform === "linux" && process.env["RUN_IMPORT_BURST_SOAK"] === "1";
const FILE_COUNT = Number(process.env["IMPORT_BURST_FILE_COUNT"] ?? 350);
// One-minute pull cadence plus enough time for 350 targeted delete jobs.
const PULL_TIMEOUT_MS = 150_000;
const HEALTH_TIMEOUT_MS = 1_000;
const MAX_HEALTH_LATENCY_MS = 500;
const MAX_SUSTAINED_CPU_SATURATION_MS = 5_000;
const MAX_RSS_BYTES = 1_280 * 1024 * 1024;
const MAX_RSS_GROWTH_BYTES = 320 * 1024 * 1024;
const CPU_SATURATION_FRACTION = 0.9;
const RESOURCE_SAMPLE_EVERY = 4;
const PACKAGED_RUNTIME_CPU_LIMIT = 2;
const HEALTH_ENDPOINTS = ["live", "ready", "operate"] as const;
const IMPORT_BATCH_SIZE = 50;
const IMPORT_BARRIER_SCHEDULED_FOR = Date.UTC(2100, 0, 1);
const IMPORT_BARRIER_TRIGGER = "hold_import_burst_jobs";

interface ProcessInfo {
  pid: number;
  parentPid: number;
  state: string;
  name: string;
  command: string;
  cpuTicks: number;
  rssBytes: number;
}

type RuntimeRole = "web" | "worker";
type RuntimeRolePids = Record<RuntimeRole, number>;

interface ResourceSample {
  atMs: number;
  cpuTicksByPid: ReadonlyMap<number, number>;
  rssBytes: number;
}

interface ResourceUsageSnapshot {
  maxCpuCores: number;
  maxCpuFraction: number;
  maxSustainedCpuSaturationMs: number;
  baselineRssBytes: number;
  maxRssBytes: number;
  maxRssGrowthBytes: number;
  finalRssBytes: number;
  finalRssGrowthBytes: number;
}

class ResourceUsageTracker {
  private readonly clockTicksPerSecond: number;
  private readonly cpuCapacity: number;
  private readonly saturationFraction: number;
  private previous: ResourceSample | undefined;
  private consecutiveSaturationMs = 0;
  private readonly usage: ResourceUsageSnapshot = {
    maxCpuCores: 0,
    maxCpuFraction: 0,
    maxSustainedCpuSaturationMs: 0,
    baselineRssBytes: 0,
    maxRssBytes: 0,
    maxRssGrowthBytes: 0,
    finalRssBytes: 0,
    finalRssGrowthBytes: 0,
  };

  constructor(options: {
    clockTicksPerSecond: number;
    cpuCapacity: number;
    saturationFraction: number;
  }) {
    this.clockTicksPerSecond = options.clockTicksPerSecond;
    this.cpuCapacity = options.cpuCapacity;
    this.saturationFraction = options.saturationFraction;
  }

  observe(sample: ResourceSample): void {
    const previous = this.previous;
    if (!previous) {
      this.usage.baselineRssBytes = sample.rssBytes;
      this.usage.maxRssBytes = sample.rssBytes;
      this.usage.finalRssBytes = sample.rssBytes;
      this.previous = sample;
      return;
    }

    const elapsedMs = sample.atMs - previous.atMs;
    if (elapsedMs > 0) {
      let elapsedTicks = 0;
      for (const [pid, currentTicks] of sample.cpuTicksByPid) {
        const previousTicks = previous.cpuTicksByPid.get(pid);
        if (previousTicks !== undefined && currentTicks >= previousTicks) {
          elapsedTicks += currentTicks - previousTicks;
        }
      }
      const cpuCores =
        elapsedTicks / this.clockTicksPerSecond / (elapsedMs / 1_000);
      const cpuFraction = cpuCores / this.cpuCapacity;
      this.usage.maxCpuCores = Math.max(this.usage.maxCpuCores, cpuCores);
      this.usage.maxCpuFraction = Math.max(
        this.usage.maxCpuFraction,
        cpuFraction,
      );
      this.consecutiveSaturationMs =
        cpuFraction >= this.saturationFraction
          ? this.consecutiveSaturationMs + elapsedMs
          : 0;
      this.usage.maxSustainedCpuSaturationMs = Math.max(
        this.usage.maxSustainedCpuSaturationMs,
        this.consecutiveSaturationMs,
      );
    }

    this.usage.maxRssBytes = Math.max(this.usage.maxRssBytes, sample.rssBytes);
    this.usage.maxRssGrowthBytes = Math.max(
      this.usage.maxRssGrowthBytes,
      sample.rssBytes - this.usage.baselineRssBytes,
    );
    this.usage.finalRssBytes = sample.rssBytes;
    this.usage.finalRssGrowthBytes =
      sample.rssBytes - this.usage.baselineRssBytes;
    this.previous = sample;
  }

  snapshot(): ResourceUsageSnapshot {
    return { ...this.usage };
  }
}

function resourceSample(
  atMs: number,
  cpuTicksByPid: readonly (readonly [number, number])[],
  rssBytes: number,
): ResourceSample {
  return {
    atMs,
    cpuTicksByPid: new Map(cpuTicksByPid),
    rssBytes,
  };
}

function parseProcStatCpuTicks(stat: string): number {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) throw new Error("Malformed /proc stat record");
  const fields = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) {
    throw new Error("Malformed /proc CPU tick fields");
  }
  return userTicks + systemTicks;
}

function parseCpuMax(value: string, hostParallelism: number): number {
  const [quotaValue, periodValue] = value.trim().split(/\s+/);
  if (quotaValue === "max") return hostParallelism;
  const quota = Number(quotaValue);
  const period = Number(periodValue);
  if (!Number.isFinite(quota) || !Number.isFinite(period) || period <= 0) {
    throw new Error("Malformed cgroup cpu.max value");
  }
  return Math.min(hostParallelism, quota / period);
}

function parseCpuList(value: string): number[] {
  const cpus = value
    .trim()
    .split(",")
    .flatMap((part) => {
      const [startValue, endValue] = part.split("-");
      const start = Number(startValue);
      const end = endValue === undefined ? start : Number(endValue);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start
      ) {
        throw new Error("Malformed Linux CPU list");
      }
      return Array.from({ length: end - start + 1 }, (_, offset) => {
        return start + offset;
      });
    });
  if (cpus.length === 0) throw new Error("Linux CPU list is empty");
  return cpus;
}

function limitedCpuList(value: string, limit: number): string {
  return parseCpuList(value).slice(0, limit).join(",");
}

class RoleContinuityTracker {
  private readonly expected: RuntimeRolePids;
  private readonly observedFailures = new Set<string>();

  constructor(expected: RuntimeRolePids) {
    this.expected = expected;
  }

  observe(observed: Partial<RuntimeRolePids>): void {
    for (const role of ["web", "worker"] as const) {
      const expectedPid = this.expected[role];
      const observedPid = observed[role];
      if (observedPid === undefined) {
        this.observedFailures.add(
          `${role} child disappeared (expected pid ${expectedPid})`,
        );
      } else if (observedPid !== expectedPid) {
        this.observedFailures.add(
          `${role} child restarted (expected pid ${expectedPid}, observed pid ${observedPid})`,
        );
      }
    }
  }

  failures(): string[] {
    return [...this.observedFailures];
  }
}

type HealthEndpoint = (typeof HEALTH_ENDPOINTS)[number];
type HealthLatency = Record<HealthEndpoint, number>;

type RuntimeResourceReport = ResourceUsageSnapshot & {
  bunVersion: string;
  durationMs: number;
  samples: number;
  cpuCapacity: number;
  maxHealthLatencyMs: HealthLatency;
  maxPersistentZombies: number;
  roleContinuityFailures: string[];
  failures: string[];
};

interface HealthMonitor {
  failures: string[];
  maxLatencyMs: number;
  maxLatencyByEndpointMs: HealthLatency;
  maxPersistentZombies: number;
  report(): RuntimeResourceReport;
  stop(): Promise<void>;
}

const ZOMBIE_PERSISTENCE_SAMPLES = 3;

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
            const [status, commandLine, stat] = await Promise.all([
              readFile(`/proc/${entry.name}/status`, "utf8"),
              readFile(`/proc/${entry.name}/cmdline`, "utf8"),
              readFile(`/proc/${entry.name}/stat`, "utf8"),
            ]);
            const rssKilobytes = Number(
              /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)?.[1] ?? "0",
            );
            return {
              pid: Number(entry.name),
              parentPid: Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]),
              state: /^State:\s+(\S)/m.exec(status)?.[1] ?? "?",
              name: /^Name:\s+(.+)$/m.exec(status)?.[1] ?? "unknown",
              command: commandLine.replaceAll("\0", " "),
              cpuTicks: parseProcStatCpuTicks(stat),
              rssBytes: rssKilobytes * 1024,
            };
          } catch {
            return undefined;
          }
        }),
    )
  ).filter((entry): entry is ProcessInfo => entry !== undefined);
}

function selectProcessTree(
  processes: readonly ProcessInfo[],
  parentPid: number,
): ProcessInfo[] {
  const expand = (pids: ReadonlySet<number>): ReadonlySet<number> => {
    const next = new Set([
      ...pids,
      ...processes
        .filter((processInfo) => pids.has(processInfo.parentPid))
        .map((processInfo) => processInfo.pid),
    ]);
    return next.size === pids.size ? next : expand(next);
  };
  const processPids = expand(new Set([parentPid]));
  return processes.filter((processInfo) => processPids.has(processInfo.pid));
}

function findRuntimeRolePids(
  processes: readonly ProcessInfo[],
): Partial<RuntimeRolePids> {
  const result: Partial<RuntimeRolePids> = {};
  for (const processInfo of processes) {
    const role = processInfo.command.match(/--child=(web|worker)/)?.[1];
    if (role === "web") result.web = processInfo.pid;
    if (role === "worker") result.worker = processInfo.pid;
  }
  return result;
}

async function readDescendants(parentPid: number): Promise<ProcessInfo[]> {
  return (await readProcessTree(parentPid)).filter(
    (processInfo) => processInfo.pid !== parentPid,
  );
}

async function readProcessTree(parentPid: number): Promise<ProcessInfo[]> {
  return selectProcessTree(await readProcessTable(), parentPid);
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

function readClockTicksPerSecond(): number {
  const result = Bun.spawnSync(["getconf", "CLK_TCK"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const value = Number(new TextDecoder().decode(result.stdout).trim());
  if (result.exitCode !== 0 || !Number.isFinite(value) || value <= 0) {
    throw new Error("Unable to determine Linux clock ticks per second");
  }
  return value;
}

async function readAllowedCpuList(pid: number): Promise<string> {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const value = /^Cpus_allowed_list:\s+(.+)$/m.exec(status)?.[1];
  if (!value) throw new Error(`Process ${pid} has no CPU affinity record`);
  return value.trim();
}

async function readCpuCapacity(pid: number): Promise<number> {
  const affinityParallelism = parseCpuList(
    await readAllowedCpuList(pid),
  ).length;
  const hostParallelism = Math.max(
    1,
    Math.min(availableParallelism(), affinityParallelism),
  );
  try {
    return Math.max(
      0.1,
      parseCpuMax(
        await readFile("/sys/fs/cgroup/cpu.max", "utf8"),
        hostParallelism,
      ),
    );
  } catch {
    try {
      const [quotaValue, periodValue] = await Promise.all([
        readFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "utf8"),
        readFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us", "utf8"),
      ]);
      const quota = Number(quotaValue.trim());
      const period = Number(periodValue.trim());
      return quota > 0 && period > 0
        ? Math.max(0.1, Math.min(hostParallelism, quota / period))
        : hostParallelism;
    } catch {
      return hostParallelism;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeHealthFailure(body: string): string {
  try {
    const payload: unknown = JSON.parse(body);
    if (!isRecord(payload) || !Array.isArray(payload["checks"])) {
      return body.slice(0, 500);
    }
    const failures = payload["checks"]
      .filter(isRecord)
      .filter((check) => check["status"] !== "healthy")
      .map((check) => {
        const name = String(check["name"] ?? "unknown");
        const status = String(check["status"] ?? "unknown");
        const message = String(check["message"] ?? "no message");
        return `${name}=${status} (${message})`;
      });
    return failures.length > 0 ? failures.join(", ") : "no failing check";
  } catch {
    return body.slice(0, 500);
  }
}

async function startHealthMonitor(
  baseUrl: string,
  supervisor: Bun.ReadableSubprocess,
  expectedRolePids: RuntimeRolePids,
): Promise<HealthMonitor> {
  let stopped = false;
  let sampleCount = 0;
  const startedAt = Date.now();
  const cpuCapacity = await readCpuCapacity(supervisor.pid);
  const resourceTracker = new ResourceUsageTracker({
    clockTicksPerSecond: readClockTicksPerSecond(),
    cpuCapacity,
    saturationFraction: CPU_SATURATION_FRACTION,
  });
  const roleTracker = new RoleContinuityTracker(expectedRolePids);
  const zombieTracker = new PersistentZombieTracker();
  const recordFailure = (failure: string): void => {
    if (!monitor.failures.includes(failure)) monitor.failures.push(failure);
  };
  const monitor: HealthMonitor = {
    failures: [],
    maxLatencyMs: 0,
    maxLatencyByEndpointMs: { live: 0, ready: 0, operate: 0 },
    maxPersistentZombies: 0,
    report(): RuntimeResourceReport {
      return {
        bunVersion: Bun.version,
        durationMs: Date.now() - startedAt,
        samples: sampleCount,
        cpuCapacity,
        ...resourceTracker.snapshot(),
        maxHealthLatencyMs: { ...monitor.maxLatencyByEndpointMs },
        maxPersistentZombies: monitor.maxPersistentZombies,
        roleContinuityFailures: roleTracker.failures(),
        failures: [...monitor.failures],
      };
    },
    async stop(): Promise<void> {
      stopped = true;
      await monitoring;
    },
  };
  const sampleHealth = async (endpoint: HealthEndpoint): Promise<void> => {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}/health/${endpoint}`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text();
        recordFailure(
          `${endpoint}: HTTP ${response.status}: ${describeHealthFailure(body)}`,
        );
      }
    } catch (error) {
      recordFailure(`${endpoint}: ${String(error)}`);
    }
    const latencyMs = performance.now() - startedAt;
    monitor.maxLatencyByEndpointMs[endpoint] = Math.max(
      monitor.maxLatencyByEndpointMs[endpoint],
      latencyMs,
    );
    monitor.maxLatencyMs = Math.max(monitor.maxLatencyMs, latencyMs);
  };
  const sample = async (sampleIndex: number): Promise<void> => {
    if (stopped) return;
    await Promise.all(HEALTH_ENDPOINTS.map(sampleHealth));
    sampleCount++;

    if (sampleIndex % RESOURCE_SAMPLE_EVERY === 0) {
      const processTree = await readProcessTree(supervisor.pid);
      const descendants = processTree.filter(
        (processInfo) => processInfo.pid !== supervisor.pid,
      );
      resourceTracker.observe({
        atMs: Date.now(),
        cpuTicksByPid: new Map(
          processTree.map(({ pid, cpuTicks }) => [pid, cpuTicks]),
        ),
        rssBytes: processTree.reduce(
          (total, processInfo) => total + processInfo.rssBytes,
          0,
        ),
      });
      roleTracker.observe(findRuntimeRolePids(descendants));
      roleTracker.failures().forEach(recordFailure);

      const persistentZombies = zombieTracker.observe(
        descendants.filter((processInfo) => processInfo.state === "Z"),
      );
      monitor.maxPersistentZombies = Math.max(
        monitor.maxPersistentZombies,
        persistentZombies.length,
      );
      if (persistentZombies.length > 0) {
        recordFailure(
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

function trackedSurvivors(
  tracked: readonly ProcessInfo[],
  current: readonly ProcessInfo[],
): ProcessInfo[] {
  const currentByPid = new Map(
    current.map((processInfo) => [processInfo.pid, processInfo]),
  );
  return tracked.filter((processInfo) => {
    const observed = currentByPid.get(processInfo.pid);
    return (
      observed?.name === processInfo.name &&
      observed.command === processInfo.command
    );
  });
}

async function stopProcessGroup(child: Bun.ReadableSubprocess): Promise<void> {
  const tracked = await readProcessTree(child.pid);
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(10_000).then(() => false),
  ]);
  const trackedPids = new Set(tracked.map(({ pid }) => pid));
  const refreshed = await readProcessTree(child.pid);
  const owned = [
    ...tracked,
    ...refreshed.filter(({ pid }) => !trackedPids.has(pid)),
  ];
  let survivors = trackedSurvivors(owned, await readProcessTable());
  if (stopped && survivors.length === 0) return;

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  for (const survivor of survivors) {
    try {
      process.kill(survivor.pid, "SIGKILL");
    } catch {
      // A process that disappeared between inventory and signal is absent.
    }
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    survivors = trackedSurvivors(owned, await readProcessTable());
    if (survivors.length === 0) return;
    await Bun.sleep(50);
  }
  throw new Error(
    `Import-burst process tree could not be proven gone: ${survivors
      .map(({ pid, name }) => `${pid} ${name}`)
      .join(", ")}`,
  );
}

async function commitBurst(
  checkoutDir: string,
  phase: "add" | "update" | "delayed-update",
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
          const marker =
            phase === "update"
              ? "Update marker: update."
              : "Update marker: delayed.";
          await writeFile(path, `${existing.trimEnd()}\n\n${marker}\n`);
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

interface JobBarrierSnapshot {
  jobIds: string[];
  itemCount: number;
}

class DurableImportJobBarrier {
  private readonly databasePath: string;
  private armed = false;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  arm(): void {
    const database = new Database(this.databasePath);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      database.exec(`
        DROP TRIGGER IF EXISTS ${IMPORT_BARRIER_TRIGGER};
        CREATE TRIGGER ${IMPORT_BARRIER_TRIGGER}
        AFTER INSERT ON job_queue
        WHEN NEW.type = 'directory-sync:directory-import'
        BEGIN
          UPDATE job_queue
          SET scheduledFor = ${IMPORT_BARRIER_SCHEDULED_FOR}
          WHERE id = NEW.id;
        END;
      `);
      this.armed = true;
    } finally {
      database.close();
    }
  }

  readHeldImports(): JobBarrierSnapshot {
    const database = new Database(this.databasePath, { readonly: true });
    try {
      const rows = database
        .query<{ id: string; itemCount: number }, [number]>(
          `SELECT id,
                  coalesce(json_array_length(data, '$.paths'), 0) AS itemCount
           FROM job_queue
           WHERE type = 'directory-sync:directory-import'
             AND status = 'pending'
             AND scheduledFor = ?
           ORDER BY createdAt, id`,
        )
        .all(IMPORT_BARRIER_SCHEDULED_FOR);
      return {
        jobIds: rows.map(({ id }) => id),
        itemCount: rows.reduce((total, { itemCount }) => total + itemCount, 0),
      };
    } finally {
      database.close();
    }
  }

  release(): void {
    if (!this.armed) return;
    const database = new Database(this.databasePath);
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`DROP TRIGGER IF EXISTS ${IMPORT_BARRIER_TRIGGER}`);
      database
        .query<void, [number, number]>(
          `UPDATE job_queue
           SET scheduledFor = ?
           WHERE type = 'directory-sync:directory-import' AND scheduledFor = ?`,
        )
        .run(Date.now(), IMPORT_BARRIER_SCHEDULED_FOR);
      database.exec("COMMIT");
      this.armed = false;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
  }
}

function readJobSchedule(database: Database, jobId: string): number {
  const row = database
    .query<{ scheduledFor: number }, [string]>(
      "SELECT scheduledFor FROM job_queue WHERE id = ?",
    )
    .get(jobId);
  if (!row) throw new Error(`Missing test job ${jobId}`);
  return row.scheduledFor;
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

function countProbeNotesWithMarker(
  databasePath: string,
  marker: string,
): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database
      .query<{ count: number }, [string]>(
        `SELECT count(*) AS count
         FROM entities
         WHERE "entityType" = 'note'
           AND id LIKE 'directory-sync-stress-%'
           AND instr(content, ?) > 0`,
      )
      .get(marker);
    return row?.count ?? 0;
  } finally {
    database.close();
  }
}

async function waitForPersistedProbeMarker(
  databasePath: string,
  marker: string,
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
        const count = countProbeNotesWithMarker(databasePath, marker);
        return count === FILE_COUNT ? true : undefined;
      } catch {
        return undefined;
      }
    },
    () =>
      new Error(
        `Timed out waiting for ${FILE_COUNT} persisted probes containing ${marker}`,
      ),
  );
}

function readQueuedDeletes(
  databasePath: string,
  createdAfter: number,
): JobBarrierSnapshot {
  const database = new Database(databasePath, { readonly: true });
  try {
    const rows = database
      .query<{ id: string; itemCount: number }, [number]>(
        `SELECT id,
                CASE
                  WHEN json_type(data, '$.deletions') = 'array'
                    THEN json_array_length(data, '$.deletions')
                  ELSE 1
                END AS itemCount
         FROM job_queue
         WHERE type = 'directory-sync:directory-delete' AND createdAt >= ?
         ORDER BY createdAt, id`,
      )
      .all(createdAfter);
    return {
      jobIds: rows.map(({ id }) => id),
      itemCount: rows.reduce((total, { itemCount }) => total + itemCount, 0),
    };
  } finally {
    database.close();
  }
}

async function waitForQueuedJobs(
  probe: () => JobBarrierSnapshot,
  expectedJobCount: number,
  expectedItemCount: number,
  child: Bun.ReadableSubprocess,
  description: string,
): Promise<JobBarrierSnapshot> {
  return pollUntil(
    Date.now() + PULL_TIMEOUT_MS,
    250,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`Brain exited while queueing ${description}`);
      }
      try {
        const snapshot = probe();
        if (
          snapshot.jobIds.length > expectedJobCount ||
          snapshot.itemCount > expectedItemCount
        ) {
          throw new Error(
            `Unexpected ${description}: ${snapshot.jobIds.length} jobs for ${snapshot.itemCount} items`,
          );
        }
        return snapshot.jobIds.length === expectedJobCount &&
          snapshot.itemCount === expectedItemCount
          ? snapshot
          : undefined;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unexpected ")) {
          throw error;
        }
        return undefined;
      }
    },
    () =>
      new Error(
        `Timed out waiting for ${expectedJobCount} durable ${description} jobs covering ${expectedItemCount} items`,
      ),
  );
}

function countTerminalJobs(databasePath: string, jobIds: string[]): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    const statusQuery = database.query<{ status: string }, [string]>(
      "SELECT status FROM job_queue WHERE id = ?",
    );
    return jobIds.filter((jobId) => {
      const status = statusQuery.get(jobId)?.status;
      return status === "completed" || status === "failed";
    }).length;
  } finally {
    database.close();
  }
}

async function waitForTerminalJobs(
  databasePath: string,
  jobIds: string[],
  child: Bun.ReadableSubprocess,
): Promise<void> {
  await pollUntil(
    Date.now() + PULL_TIMEOUT_MS,
    250,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`Brain exited while draining barrier jobs`);
      }
      try {
        return countTerminalJobs(databasePath, jobIds) === jobIds.length
          ? true
          : undefined;
      } catch {
        return undefined;
      }
    },
    () => new Error("Timed out waiting for barrier jobs to become terminal"),
  );
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
    let resourceReport: RuntimeResourceReport | undefined;
    let importBarrier: DurableImportJobBarrier | undefined;
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

      const allowedCpuList = await readAllowedCpuList(process.pid);
      const supervisorCommand =
        parseCpuList(allowedCpuList).length > PACKAGED_RUNTIME_CPU_LIMIT
          ? [
              "taskset",
              "--cpu-list",
              limitedCpuList(allowedCpuList, PACKAGED_RUNTIME_CPU_LIMIT),
              "bun",
              brainEntrypoint,
              "start",
            ]
          : ["bun", brainEntrypoint, "start"];
      supervisor = Bun.spawn(supervisorCommand, {
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

      const healthBaseUrl = `http://127.0.0.1:${productionPort}`;
      await waitForHealth(`${healthBaseUrl}/health/live`, supervisor);
      // The worker child boots a few seconds after web first serves health.
      const supervisorPid = supervisor.pid;
      const rolePids = await pollUntil(
        Date.now() + 30_000,
        500,
        async () => {
          const found = findRuntimeRolePids(
            await readDescendants(supervisorPid),
          );
          return found.web !== undefined && found.worker !== undefined
            ? { web: found.web, worker: found.worker }
            : undefined;
        },
        () => new Error("Timed out waiting for web and worker children"),
      );
      expect(rolePids.web).not.toBe(rolePids.worker);
      await waitForHealth(`${healthBaseUrl}/health/operate`, supervisor);

      const databasePath = join(appDir, "data", "brain.db");
      const jobDatabasePath = join(appDir, "data", "brain-jobs.db");
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

      monitor = await startHealthMonitor(healthBaseUrl, supervisor, rolePids);
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
      await waitForPersistedProbeMarker(
        databasePath,
        "Deterministic import-burst probe",
        supervisor,
      );

      await commitBurst(writerDir, "update");
      await waitForFileContent(
        finalProbePath,
        "Update marker: update.",
        supervisor,
      );
      await waitForPersistedProbeMarker(
        databasePath,
        "Update marker: update.",
        supervisor,
      );

      // Hold every job from a second update at the durable scheduler boundary.
      // The worker remains free to pull the later remote deletion and queue its
      // targeted delete jobs before these older imports can execute.
      importBarrier = new DurableImportJobBarrier(jobDatabasePath);
      importBarrier.arm();
      await commitBurst(writerDir, "delayed-update");
      const expectedBatchJobs = Math.ceil(FILE_COUNT / IMPORT_BATCH_SIZE);
      const heldImports = await waitForQueuedJobs(
        () => importBarrier?.readHeldImports() ?? { jobIds: [], itemCount: 0 },
        expectedBatchJobs,
        FILE_COUNT,
        supervisor,
        "held import",
      );
      expect(
        countProbeNotesWithMarker(databasePath, "Update marker: delayed."),
      ).toBe(0);

      const deletesCreatedAfter = Date.now();
      await commitProbeCleanup(writerDir);
      const queuedDeletes = await waitForQueuedJobs(
        () => readQueuedDeletes(jobDatabasePath, deletesCreatedAfter),
        expectedBatchJobs,
        FILE_COUNT,
        supervisor,
        "targeted delete",
      );

      // Releasing only after both durable snapshots exist makes the race
      // deliberate: old imports and authoritative deletes may now interleave.
      importBarrier.release();
      await waitForTerminalJobs(
        jobDatabasePath,
        [...heldImports.jobIds, ...queuedDeletes.jobIds],
        supervisor,
      );

      const brainDataDir = join(appDir, "brain-data");
      await waitForCleanup(
        brainDataDir,
        databasePath,
        baselineNoteCount,
        supervisor,
      );
      expect(
        countProbeNotesWithMarker(databasePath, "Update marker: delayed."),
      ).toBe(0);
      await monitor.stop();
      resourceReport = monitor.report();

      expect(monitor.failures).toEqual([]);
      expect(resourceReport.roleContinuityFailures).toEqual([]);
      expect(resourceReport.maxPersistentZombies).toBe(0);
      expect(resourceReport.maxSustainedCpuSaturationMs).toBeLessThan(
        MAX_SUSTAINED_CPU_SATURATION_MS,
      );
      expect(resourceReport.maxRssBytes).toBeLessThan(MAX_RSS_BYTES);
      expect(resourceReport.maxRssGrowthBytes).toBeLessThan(
        MAX_RSS_GROWTH_BYTES,
      );
      for (const endpoint of HEALTH_ENDPOINTS) {
        expect(resourceReport.maxHealthLatencyMs[endpoint]).toBeLessThan(
          MAX_HEALTH_LATENCY_MS,
        );
      }
    } catch (error) {
      failure = error;
    } finally {
      try {
        importBarrier?.release();
      } catch (error) {
        failure ??= error;
      }
      await monitor?.stop();
      if (monitor) {
        resourceReport ??= monitor.report();
        console.info(
          `IMPORT_BURST_RESOURCE_REPORT ${JSON.stringify(resourceReport)}`,
        );
      }
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

it("tracks sustained CPU saturation separately from a transient spike", () => {
  const tracker = new ResourceUsageTracker({
    clockTicksPerSecond: 100,
    cpuCapacity: 2,
    saturationFraction: 0.9,
  });

  tracker.observe(resourceSample(0, [[10, 0]], 100));
  tracker.observe(resourceSample(1_000, [[10, 190]], 120));
  tracker.observe(resourceSample(2_000, [[10, 200]], 110));
  tracker.observe(resourceSample(3_000, [[10, 390]], 140));
  tracker.observe(resourceSample(4_000, [[10, 580]], 150));

  expect(tracker.snapshot()).toEqual({
    maxCpuCores: 1.9,
    maxCpuFraction: 0.95,
    maxSustainedCpuSaturationMs: 2_000,
    baselineRssBytes: 100,
    maxRssBytes: 150,
    maxRssGrowthBytes: 50,
    finalRssBytes: 150,
    finalRssGrowthBytes: 50,
  });
});

it("does not count a replacement process's historical CPU time", () => {
  const tracker = new ResourceUsageTracker({
    clockTicksPerSecond: 100,
    cpuCapacity: 2,
    saturationFraction: 0.9,
  });

  tracker.observe(resourceSample(0, [[10, 100]], 100));
  tracker.observe(resourceSample(1_000, [[11, 10_000]], 100));

  expect(tracker.snapshot().maxCpuCores).toBe(0);
});

it("parses process CPU ticks when the command name contains spaces", () => {
  const fields = Array.from({ length: 13 }, () => "0");
  fields[0] = "S";
  fields[11] = "40";
  fields[12] = "6";

  expect(parseProcStatCpuTicks(`123 (brain worker) ${fields.join(" ")}`)).toBe(
    46,
  );
});

it("uses a cgroup CPU quota when it is below host parallelism", () => {
  expect(parseCpuMax("200000 100000", 8)).toBe(2);
  expect(parseCpuMax("max 100000", 8)).toBe(8);
});

it("limits the packaged runtime to the first two allowed CPUs", () => {
  expect(parseCpuList("0-2,5,7-8")).toEqual([0, 1, 2, 5, 7, 8]);
  expect(limitedCpuList("3,5-7", 2)).toBe("3,5");
});

it("tracks only the original process when a pid is reused", () => {
  const original: ProcessInfo = {
    pid: 10,
    parentPid: 1,
    state: "S",
    name: "bun",
    command: "brain start",
    cpuTicks: 0,
    rssBytes: 0,
  };

  expect(trackedSurvivors([original], [original])).toEqual([original]);
  expect(
    trackedSurvivors([original], [{ ...original, command: "unrelated" }]),
  ).toEqual([]);
});

it("reports missing and replaced supervised runtime roles once", () => {
  const tracker = new RoleContinuityTracker({ web: 10, worker: 11 });

  tracker.observe({ web: 10 });
  tracker.observe({ web: 12, worker: 11 });
  tracker.observe({ web: 12, worker: 11 });

  expect(tracker.failures()).toEqual([
    "worker child disappeared (expected pid 11)",
    "web child restarted (expected pid 10, observed pid 12)",
  ]);
});

it("holds queued imports durably without blocking later job types", async () => {
  const root = await mkdtemp(join(tmpdir(), "import-job-barrier-"));
  const databasePath = join(root, "jobs.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE job_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduledFor INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);
  const insert = database.query<void, [string, string, string, number, number]>(
    "INSERT INTO job_queue (id, type, data, status, scheduledFor, createdAt) VALUES (?, ?, ?, 'pending', ?, ?)",
  );
  const barrier = new DurableImportJobBarrier(databasePath);

  try {
    barrier.arm();
    insert.run(
      "import-1",
      "directory-sync:directory-import",
      JSON.stringify({ paths: ["one.md", "two.md"] }),
      1,
      1,
    );
    insert.run("sync-1", "directory-sync:sync-request", "{}", 2, 2);

    expect(barrier.readHeldImports()).toEqual({
      jobIds: ["import-1"],
      itemCount: 2,
    });
    expect(readJobSchedule(database, "sync-1")).toBe(2);

    barrier.release();
    expect(readJobSchedule(database, "import-1")).toBeLessThanOrEqual(
      Date.now(),
    );

    insert.run(
      "import-2",
      "directory-sync:directory-import",
      JSON.stringify({ paths: ["three.md"] }),
      3,
      3,
    );
    expect(readJobSchedule(database, "import-2")).toBe(3);
  } finally {
    barrier.release();
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("ignores a transient zombie that is reaped before the next sample", () => {
  const tracker = new PersistentZombieTracker();
  const zombie: ProcessInfo = {
    pid: 101,
    parentPid: 100,
    state: "Z",
    name: "sh",
    command: "",
    cpuTicks: 0,
    rssBytes: 0,
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
    cpuTicks: 0,
    rssBytes: 0,
  };

  expect(tracker.observe([zombie])).toEqual([]);
  expect(tracker.observe([zombie])).toEqual([]);
  expect(tracker.observe([zombie])).toEqual([zombie]);
});

it("runs both directory-sync acceptance gates nightly in one isolated CI job", async () => {
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
  expect(workflow).toContain("MOCKED_AI_IMPORT_COUNT: 350");
  expect(workflow).toContain("MOCKED_AI_SERVICE_DELAY_MS: 100");
  expect(workflow).toContain("MOCKED_AI_CPU_LIMIT: 2");
  expect(workflow).toContain("bunx turbo run build --filter=@rizom/brain");
  expect(workflow).toContain(
    "bun test packages/brain-cli/test/import-burst-feature-load.test.ts",
  );
  expect(workflow).toContain(
    "bun test packages/brain-cli/test/import-burst-stability.test.ts",
  );
  expect(workflow).toContain(
    "if: ${{ steps.build.outcome == 'success' && !cancelled() }}",
  );
  expect(workflow).toContain("directory-sync-feature-resource.log");
  expect(workflow).toContain("set -o pipefail");
  expect(workflow).toContain("issues: write");
  expect(workflow).toContain("if: failure()");
  expect(workflow).not.toContain("matrix:");
});
