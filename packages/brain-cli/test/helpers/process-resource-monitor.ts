import { readFile } from "node:fs/promises";
import { runProcess } from "@brains/utils/run-process";

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
  maxSustainedEventLoopDelayMs: number;
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
  private readonly eventLoopStallThresholdMs: number;
  private previous: ProcessResourceSample | undefined;
  private consecutiveSaturationMs = 0;
  private consecutiveEventLoopDelayMs = 0;
  private readonly usage: ProcessResourceSnapshot = {
    samples: 0,
    maxCpuCores: 0,
    maxCpuFraction: 0,
    maxSustainedCpuSaturationMs: 0,
    maxEventLoopDelayMs: 0,
    maxSustainedEventLoopDelayMs: 0,
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
    eventLoopStallThresholdMs: number;
  }) {
    this.cpuCapacity = options.cpuCapacity;
    this.saturationFraction = options.saturationFraction;
    this.expectedSampleIntervalMs = options.expectedSampleIntervalMs;
    this.eventLoopStallThresholdMs = options.eventLoopStallThresholdMs;
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
      const eventLoopDelayMs = Math.max(
        0,
        elapsedMs - this.expectedSampleIntervalMs,
      );
      this.usage.maxEventLoopDelayMs = Math.max(
        this.usage.maxEventLoopDelayMs,
        eventLoopDelayMs,
      );
      this.consecutiveEventLoopDelayMs =
        eventLoopDelayMs >= this.eventLoopStallThresholdMs
          ? this.consecutiveEventLoopDelayMs + eventLoopDelayMs
          : 0;
      this.usage.maxSustainedEventLoopDelayMs = Math.max(
        this.usage.maxSustainedEventLoopDelayMs,
        this.consecutiveEventLoopDelayMs,
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

const SETTLE_POLL_INTERVAL_MS = 50;

/**
 * Wait for RSS to fall to `below`, giving up after `budgetMs`.
 *
 * Returns the last reading either way, so a process whose memory never comes
 * down still reports the honest number and fails the caller's assertion —
 * the wait is shortened, not the check.
 */
async function settleRss(budgetMs: number, below?: number): Promise<number> {
  const deadline = performance.now() + budgetMs;
  const poll = async (): Promise<number> => {
    const rss = process.memoryUsage.rss();
    if (below !== undefined && rss <= below) return rss;
    if (performance.now() >= deadline) return rss;
    await Bun.sleep(
      Math.min(
        SETTLE_POLL_INTERVAL_MS,
        Math.max(0, deadline - performance.now()),
      ),
    );
    return poll();
  };
  return poll();
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
    /**
     * How long to wait, at most, for RSS to come back down after the burst.
     *
     * A ceiling rather than a fixed pause: with `settleBelowRssBytes` the wait
     * ends as soon as RSS is under that mark, which is the condition the
     * caller goes on to assert. Sleeping the whole budget every run measured
     * the clock, not the process — it cost five seconds a run whether memory
     * had settled in the first two hundred milliseconds or never settled at
     * all. Without a target this still sleeps the full time.
     */
    finalSampleDelayMs?: number;
    /** Stop waiting once RSS is at or below this. */
    settleBelowRssBytes?: number;
  }): Promise<ProcessResourceSnapshot>;
}

export function startProcessResourceMonitor(options: {
  intervalMs: number;
  cpuCapacity: number;
  saturationFraction: number;
  eventLoopStallThresholdMs: number;
}): ProcessResourceMonitor {
  let running = true;
  const tracker = new ProcessResourceTracker({
    cpuCapacity: options.cpuCapacity,
    saturationFraction: options.saturationFraction,
    expectedSampleIntervalMs: options.intervalMs,
    eventLoopStallThresholdMs: options.eventLoopStallThresholdMs,
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
        tracker.observeFinalRss(
          await settleRss(finalSampleDelayMs, options.settleBelowRssBytes),
        );
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
    const result = await runProcess([
      "taskset",
      "--all-tasks",
      "--pid",
      "--cpu-list",
      limitedCpuList(allowed, limit),
      String(process.pid),
    ]);
    if (result.exitCode !== 0) {
      const error = result.stderr.trim();
      throw new Error(
        `Unable to constrain feature-load CPU affinity: ${error}`,
      );
    }
  }
  return parseCpuList(await readAllowedCpuList(process.pid)).length;
}
