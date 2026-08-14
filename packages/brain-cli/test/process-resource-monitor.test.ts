import { describe, expect, it } from "bun:test";
import {
  ProcessResourceTracker,
  limitedCpuList,
  parseCpuList,
} from "./helpers/process-resource-monitor";

describe("ProcessResourceTracker", () => {
  it("separates a transient CPU spike from sustained saturation", () => {
    const tracker = new ProcessResourceTracker({
      cpuCapacity: 2,
      saturationFraction: 0.9,
      expectedSampleIntervalMs: 100,
      eventLoopStallThresholdMs: 500,
    });

    tracker.observe({ atMs: 0, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 1_000, cpuMicros: 1_900_000, rssBytes: 120 });
    tracker.observe({ atMs: 2_000, cpuMicros: 2_000_000, rssBytes: 110 });
    tracker.observe({ atMs: 3_000, cpuMicros: 3_900_000, rssBytes: 140 });
    tracker.observe({ atMs: 4_000, cpuMicros: 5_800_000, rssBytes: 150 });

    expect(tracker.snapshot()).toEqual({
      samples: 5,
      maxCpuCores: 1.9,
      maxCpuFraction: 0.95,
      maxSustainedCpuSaturationMs: 2_000,
      maxEventLoopDelayMs: 900,
      maxSustainedEventLoopDelayMs: 3_600,
      baselineRssBytes: 100,
      maxRssBytes: 150,
      maxRssGrowthBytes: 50,
      finalRssBytes: 150,
      finalRssGrowthBytes: 50,
    });
  });

  it("ignores a non-positive sampling interval", () => {
    const tracker = new ProcessResourceTracker({
      cpuCapacity: 2,
      saturationFraction: 0.9,
      expectedSampleIntervalMs: 100,
      eventLoopStallThresholdMs: 500,
    });

    tracker.observe({ atMs: 1_000, cpuMicros: 100, rssBytes: 100 });
    tracker.observe({ atMs: 1_000, cpuMicros: 200, rssBytes: 110 });

    expect(tracker.snapshot().maxCpuCores).toBe(0);
    expect(tracker.snapshot().finalRssBytes).toBe(110);
  });

  it("records settled RSS without treating the idle window as loop delay", () => {
    const tracker = new ProcessResourceTracker({
      cpuCapacity: 2,
      saturationFraction: 0.9,
      expectedSampleIntervalMs: 100,
      eventLoopStallThresholdMs: 500,
    });

    tracker.observe({ atMs: 0, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 100, cpuMicros: 100_000, rssBytes: 150 });
    tracker.observeFinalRss(120);

    expect(tracker.snapshot()).toEqual({
      samples: 3,
      maxCpuCores: 1,
      maxCpuFraction: 0.5,
      maxSustainedCpuSaturationMs: 0,
      maxEventLoopDelayMs: 0,
      maxSustainedEventLoopDelayMs: 0,
      baselineRssBytes: 100,
      maxRssBytes: 150,
      maxRssGrowthBytes: 50,
      finalRssBytes: 120,
      finalRssGrowthBytes: 20,
    });
  });

  it("separates one delayed turn from sustained event-loop stalls", () => {
    const tracker = new ProcessResourceTracker({
      cpuCapacity: 2,
      saturationFraction: 0.9,
      expectedSampleIntervalMs: 100,
      eventLoopStallThresholdMs: 500,
    });

    tracker.observe({ atMs: 0, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 800, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 900, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 1_700, cpuMicros: 0, rssBytes: 100 });
    tracker.observe({ atMs: 2_500, cpuMicros: 0, rssBytes: 100 });

    expect(tracker.snapshot().maxEventLoopDelayMs).toBe(700);
    expect(tracker.snapshot().maxSustainedEventLoopDelayMs).toBe(1_400);
  });
});

describe("Linux CPU affinity parsing", () => {
  it("expands ranges and picks a deterministic subset", () => {
    expect(parseCpuList("0-2,5,7-8")).toEqual([0, 1, 2, 5, 7, 8]);
    expect(limitedCpuList("3,5-7", 2)).toBe("3,5");
  });

  it("rejects malformed and empty CPU lists", () => {
    expect(() => parseCpuList("")).toThrow("Linux CPU list is empty");
    expect(() => parseCpuList("3-1")).toThrow("Malformed Linux CPU list");
  });
});
