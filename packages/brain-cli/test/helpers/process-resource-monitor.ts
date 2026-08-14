import { readFile } from "node:fs/promises";

export interface ProcessResourceSample {
  atMs: number;
  cpuMicros: number;
  rssBytes: number;
}

export interface ProcessResourceSnapshot {
  samples: number;
  maxCpuCores: number;
  maxCpuFraction: number;
  maxSustainedCpuSaturationMs: number;
  maxEventLoopDelayMs: number;
  baselineRssBytes: number;
  maxRssBytes: number;
  maxRssGrowthBytes: number;
  finalRssBytes: number;
  finalRssGrowthBytes: number;
}

export class ProcessResourceTracker {
  private readonly cpuCapacity: number;
  private readonly saturationFraction: number;
  private readonly expectedSampleIntervalMs: number;
  private previous: ProcessResourceSample | undefined;
  private consecutiveSaturationMs = 0;
  private readonly usage: ProcessResourceSnapshot = {
    samples: 0,
    maxCpuCores: 0,
    maxCpuFraction: 0,
    maxSustainedCpuSaturationMs: 0,
    maxEventLoopDelayMs: 0,
    baselineRssBytes: 0,
    maxRssBytes: 0,
    maxRssGrowthBytes: 0,
    finalRssBytes: 0,
    finalRssGrowthBytes: 0,
  };

  constructor(options: {
    cpuCapacity: number;
    saturationFraction: number;
    expectedSampleIntervalMs: number;
  }) {
    this.cpuCapacity = options.cpuCapacity;
    this.saturationFraction = options.saturationFraction;
    this.expectedSampleIntervalMs = options.expectedSampleIntervalMs;
  }

  observe(sample: ProcessResourceSample): void {
    this.usage.samples++;
    const previous = this.previous;
    if (!previous) {
      this.usage.baselineRssBytes = sample.rssBytes;
      this.updateRss(sample.rssBytes);
      this.previous = sample;
      return;
    }

    const elapsedMs = sample.atMs - previous.atMs;
    if (elapsedMs > 0) {
      const elapsedCpuMicros = Math.max(
        0,
        sample.cpuMicros - previous.cpuMicros,
      );
      const cpuCores = elapsedCpuMicros / (elapsedMs * 1_000);
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
      this.usage.maxEventLoopDelayMs = Math.max(
        this.usage.maxEventLoopDelayMs,
        elapsedMs - this.expectedSampleIntervalMs,
      );
    }

    this.updateRss(sample.rssBytes);
    this.previous = sample;
  }

  observeFinalRss(rssBytes: number): void {
    if (!this.previous) {
      throw new Error("Cannot record settled RSS before the baseline sample");
    }
    this.usage.samples++;
    this.updateRss(rssBytes);
  }

  private updateRss(rssBytes: number): void {
    this.usage.maxRssBytes = Math.max(this.usage.maxRssBytes, rssBytes);
    this.usage.maxRssGrowthBytes = Math.max(
      this.usage.maxRssGrowthBytes,
      rssBytes - this.usage.baselineRssBytes,
    );
    this.usage.finalRssBytes = rssBytes;
    this.usage.finalRssGrowthBytes = rssBytes - this.usage.baselineRssBytes;
  }

  snapshot(): ProcessResourceSnapshot {
    return { ...this.usage };
  }
}

function takeProcessResourceSample(): ProcessResourceSample {
  const cpu = process.cpuUsage();
  return {
    atMs: performance.now(),
    cpuMicros: cpu.user + cpu.system,
    rssBytes: process.memoryUsage.rss(),
  };
}

export interface ProcessResourceMonitor {
  snapshot(): ProcessResourceSnapshot;
  stop(options?: {
    finalSampleDelayMs?: number;
  }): Promise<ProcessResourceSnapshot>;
}

export function startProcessResourceMonitor(options: {
  intervalMs: number;
  cpuCapacity: number;
  saturationFraction: number;
}): ProcessResourceMonitor {
  let running = true;
  const tracker = new ProcessResourceTracker({
    cpuCapacity: options.cpuCapacity,
    saturationFraction: options.saturationFraction,
    expectedSampleIntervalMs: options.intervalMs,
  });
  tracker.observe(takeProcessResourceSample());

  const tick = async (): Promise<void> => {
    await Bun.sleep(options.intervalMs);
    if (!running) return;
    tracker.observe(takeProcessResourceSample());
    return tick();
  };
  const finished = tick();

  return {
    snapshot(): ProcessResourceSnapshot {
      return tracker.snapshot();
    },
    async stop(options = {}): Promise<ProcessResourceSnapshot> {
      const finalSampleDelayMs = options.finalSampleDelayMs ?? 0;
      if (!Number.isFinite(finalSampleDelayMs) || finalSampleDelayMs < 0) {
        throw new Error("Final sample delay must be non-negative");
      }
      running = false;
      tracker.observe(takeProcessResourceSample());
      await finished;
      if (finalSampleDelayMs > 0) {
        await Bun.sleep(finalSampleDelayMs);
        tracker.observeFinalRss(process.memoryUsage.rss());
      }
      return tracker.snapshot();
    },
  };
}

export function parseCpuList(value: string): number[] {
  if (value.trim() === "") throw new Error("Linux CPU list is empty");
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

export function limitedCpuList(value: string, limit: number): string {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("CPU limit must be a positive integer");
  }
  return parseCpuList(value).slice(0, limit).join(",");
}

async function readAllowedCpuList(pid: number): Promise<string> {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const value = /^Cpus_allowed_list:\s+(.+)$/m.exec(status)?.[1];
  if (!value) throw new Error(`Process ${pid} has no CPU affinity record`);
  return value.trim();
}

export async function constrainCurrentProcessCpu(
  limit: number,
): Promise<number> {
  if (process.platform !== "linux") {
    throw new Error("CPU affinity acceptance requires Linux");
  }
  const allowed = await readAllowedCpuList(process.pid);
  const allowedCount = parseCpuList(allowed).length;
  if (allowedCount > limit) {
    const result = Bun.spawnSync(
      [
        "taskset",
        "--all-tasks",
        "--pid",
        "--cpu-list",
        limitedCpuList(allowed, limit),
        String(process.pid),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) {
      const error = new TextDecoder().decode(result.stderr).trim();
      throw new Error(
        `Unable to constrain feature-load CPU affinity: ${error}`,
      );
    }
  }
  return parseCpuList(await readAllowedCpuList(process.pid)).length;
}
